# =============================================================================
# Invoice Download Tool - Docker image
# -----------------------------------------------------------------------------
# Build (backed by a .dockerignore to keep the build context small):
#   npm run build -> builds backend, builds frontend, then copies
#   frontend/dist/* into backend/public/.
#
# Runtime:
#   backend serves the frontend (../public) + the JSON API on port 3000.
#   SQLite (via libsql/Prisma) + invoice files persist in ./data (a volume).
# =============================================================================

# ------------------------------- BUILD STAGE --------------------------------
FROM node:22-slim AS build

WORKDIR /app

# Copy package manifests first so dependency layers benefit from Docker cache
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all dependencies (npm workspaces install backend + frontend together)
RUN npm install

# Add `tsx` (not in package.json) to run the TypeScript seed script at runtime
RUN npm install --prefix backend --no-save --no-package-lock tsx

# Copy the rest of the source (node_modules / dist are excluded by .dockerignore)
COPY . .

# Provide the same env defaults used at runtime so build-time tooling
# (prisma config, ConfigModule) can resolve variables.
COPY backend/.env.example backend/.env

# Generate the Prisma client BEFORE compiling the backend (it is imported by code).
# backend/.env (copied above, from .env.example) provides DATABASE_URL to prisma.config.ts.
RUN cd backend && npx prisma generate

# npm run build = build:backend + build:frontend + copy:frontend -> backend/public
RUN npm run build

# ------------------------------ RUNTIME STAGE -------------------------------
FROM node:22-slim AS runner

ENV NODE_ENV=production
WORKDIR /app/backend

# Compiled backend + bundled frontend (served from ./public)
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/public ./public

# Prisma schema + migrations + config (needed for migrate deploy & seed)
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/prisma.config.ts ./prisma.config.ts

# Installed dependencies: root workspace deps + backend deps (+ tsx)
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./package.json

# Default env file; secrets are overridden via docker-compose `environment`/env_file
COPY --from=build /app/backend/.env.example ./.env

# Entrypoint: migrate -> (optional seed) -> start the API
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["bash", "/usr/local/bin/docker-entrypoint.sh"]
