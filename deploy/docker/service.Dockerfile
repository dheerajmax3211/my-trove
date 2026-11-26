# Runtime image for one Spring Boot service. The jar is built beforehand (./mvnw -DskipTests package, or CI's
# build job), so this file only packages it: no Maven, no source, no build tools in the image.
#
#   docker build -f deploy/docker/service.Dockerfile --build-arg MODULE=gateway -t my-trove/gateway .
#
# MODULE is the Maven module folder (gateway, auth, platform-service, shared-service, waiting-on, consent-gateway,
# home-pulse, ask-your-life, digital-legacy, family-treasury).
# Pinned to a tag published for both amd64 (CI, most clusters) and arm64 (Apple silicon, Graviton).
ARG JRE_IMAGE=eclipse-temurin:21.0.13_9-jre-noble

FROM ${JRE_IMAGE} AS extract
ARG MODULE
WORKDIR /build
COPY ${MODULE}/target/*-SNAPSHOT.jar app.jar
# Split the fat jar into layers (dependencies change rarely, application classes often) so image pulls are small.
RUN java -Djarmode=tools -jar app.jar extract --layers --launcher --destination extracted

FROM ${JRE_IMAGE}
ARG MODULE
LABEL org.opencontainers.image.source="https://github.com/dheerajmax3211/my-trove" \
      org.opencontainers.image.title="my-trove-${MODULE}" \
      org.opencontainers.image.licenses="NOASSERTION"
# A fixed, unprivileged user; Kubernetes runs it with runAsNonRoot and a read-only root filesystem.
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=extract /build/extracted/dependencies/ ./
COPY --from=extract /build/extracted/spring-boot-loader/ ./
COPY --from=extract /build/extracted/snapshot-dependencies/ ./
COPY --from=extract /build/extracted/application/ ./
USER 10001:10001
# Size the heap from the container's memory limit and exit (so the orchestrator restarts) on OutOfMemoryError.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError -Djava.io.tmpdir=/tmp"
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
