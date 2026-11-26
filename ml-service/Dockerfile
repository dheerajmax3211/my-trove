# Home Pulse ML service. Everything Python happens in here: nothing is installed on the host.
#
#   docker build -t my-trove/ml-service ml-service                 # runtime image (last stage)
#   docker build --target test -t my-trove/ml-service:test ml-service   # runs the unit tests while building
#   docker run --rm my-trove/ml-service:test                        # runs them again
#
# Pinned to a patch release and Debian release published for amd64 and arm64.
ARG PYTHON_IMAGE=python:3.12.16-slim-trixie

FROM ${PYTHON_IMAGE} AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv
COPY requirements.txt .
# Binary wheels only: no compiler in the image, no source builds of numpy.
RUN pip install --only-binary=:all: -r requirements.txt
COPY app ./app
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin ml \
    && mkdir -p /var/lib/ml-service && chown 10001:10001 /var/lib/ml-service

FROM base AS test
COPY requirements-dev.txt .
RUN pip install --only-binary=:all: -r requirements-dev.txt
COPY tests ./tests
COPY eval ./eval
USER 10001
RUN python -m pytest -q -p no:cacheprovider
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider"]

FROM base AS runtime
LABEL org.opencontainers.image.source="https://github.com/dheerajmax3211/my-trove" \
      org.opencontainers.image.title="my-trove-ml-service" \
      org.opencontainers.image.licenses="NOASSERTION"
# Models are mirrored here (mount a volume to keep them across restarts; without one a restart forgets them and
# home-pulse retrains each appliance on its next evaluation).
ENV MODEL_DIR=/var/lib/ml-service
USER 10001
EXPOSE 8095
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8095/health', timeout=2).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8095", "--no-access-log"]
