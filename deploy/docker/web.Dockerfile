# Static image for one web app (the workspace or the public site): a Vite build served by unprivileged nginx.
#
#   docker build -f deploy/docker/web.Dockerfile --build-arg APP=workspace \
#     --build-arg VITE_API_BASE_URL=https://api.example.com/api -t my-trove/workspace .
#
# Vite inlines VITE_* values at build time, so each environment gets its own build. Firebase web config is public
# by design (it identifies the project; security comes from Firebase Auth and the backend), so build args are fine.
FROM node:22.23.5-alpine3.23 AS build
ARG APP
ARG VITE_API_BASE_URL
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_SITE_URL
ARG VITE_WORKSPACE_URL
ARG VITE_REPO_URL
ARG VITE_TRUSTEE_PORTAL_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID} VITE_SITE_URL=${VITE_SITE_URL} \
    VITE_WORKSPACE_URL=${VITE_WORKSPACE_URL} VITE_REPO_URL=${VITE_REPO_URL} \
    VITE_TRUSTEE_PORTAL_URL=${VITE_TRUSTEE_PORTAL_URL}
WORKDIR /src
RUN corepack enable
COPY ui-common/ ./
# Local .env files must never leak into an image build; the build args above are the only config.
RUN rm -f apps/*/.env.local apps/*/.env \
 && pnpm install --frozen-lockfile \
 && pnpm --filter "@platform/${APP}..." build

FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24
ARG APP
# Pick up Alpine security fixes published after the base image was built (Trivy gates the result in CI).
USER root
RUN apk upgrade --no-cache
USER 101
COPY deploy/docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/${APP}/dist/ /usr/share/nginx/html/
# nginx-unprivileged listens on 8080 as uid 101.
EXPOSE 8080
