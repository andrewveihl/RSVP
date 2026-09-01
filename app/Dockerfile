# syntax=docker/dockerfile:1
#
# Guest wedding site.
#
# The build context is the REPO ROOT, not app/, because this app compiles the shared
# package's source in via the $shared alias. docker-compose.yml sets that context.

# ---------------------------------------------------------------------------
# Stage 1 -- install workspace dependencies and build.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /repo

# better-sqlite3 ships no prebuilt binary for Alpine's musl libc, so it is compiled
# from source here. These are build-stage only: the compiled .node file is copied into
# the runtime stage, and the toolchain is not.
RUN apk add --no-cache python3 make g++

# Manifests first, so this layer caches until a dependency actually changes.
# Every workspace manifest is needed: npm resolves the whole workspace graph even
# when only one member is being built.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY app/package.json app/
COPY admin/package.json admin/

RUN npm ci

# Only the sources this image needs. The admin app is built by its own Dockerfile.
COPY shared/ shared/
COPY app/ app/

RUN npm run build -w app \
	# Drop dev dependencies; adapter-node leaves runtime deps (better-sqlite3, pino,
	# qrcode) external, so they must survive into the runtime stage.
	&& npm prune --omit=dev

# ---------------------------------------------------------------------------
# Stage 2 -- slim runtime. No source, no toolchain, no dev dependencies.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /repo/app

ENV NODE_ENV=production \
	PORT=3000 \
	HOST=0.0.0.0 \
	DATABASE_PATH=/data/wedding-rsvp.db

# /data is the shared volume. The app user must own it, or SQLite cannot create the
# WAL sidecars beside the database.
RUN mkdir -p /data && chown -R node:node /data /repo

# Workspace installs hoist most packages to the repo root, but not all -- copy both
# so Node's upward module resolution finds everything it did at build time.
COPY --from=build --chown=node:node /repo/node_modules ./../node_modules
COPY --from=build --chown=node:node /repo/app/build ./build
COPY --from=build --chown=node:node /repo/app/package.json ./package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]
