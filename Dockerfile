# syntax=docker/dockerfile:1
#
# The Pulseform API server (server/) and its database migration tool, for Google Cloud Run. Build from the repository
# root (the server imports the shared contract in src/app/domain):
#
#   docker build -t pulseform-inbody .
#
# See server/CLOUD_RUN.md. No secret is read or stored here: OPENAI_API_KEY and the rest
# arrive as environment variables when the container runs.

ARG NODE_VERSION=24

# --- Build: bundle the server into one file with a pinned esbuild --------------------------
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app/server
# Manifest and lockfile first, so the install layer is cached until they change.
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts
COPY server/build.mjs ./
COPY server/src ./src
COPY server/tools ./tools
# Resolved by the relative import ../../src/app/domain/... from server/src.
COPY src/app/domain /app/src/app/domain
RUN npm run build

# --- Runtime: Node and two bundles (the pg driver is bundled in; no node_modules at runtime) --
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /srv
COPY --from=build --chown=node:node /app/server/dist/main.mjs /app/server/dist/migrate.mjs ./
# The SQL migrations, for the explicit migration step (see server/DATABASE.md). The server never runs them.
COPY --chown=node:node server/migrations ./migrations
# The image's built-in unprivileged user.
USER node
EXPOSE 8080
# Used by `docker run` locally; Cloud Run ignores HEALTHCHECK and probes the port itself.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Exec form: Node is PID 1 and receives SIGTERM, which the server handles (graceful close).
CMD ["node", "main.mjs"]
