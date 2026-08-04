#!/usr/bin/env bash
set -e

# 1. Apply pending database migrations (creates the SQLite DB if missing)
echo "==> Applying database migrations..."
npx prisma migrate deploy

# 2. Optionally seed the database with roles / permissions / admin user.
#    The seed script uses upsert so it is safe to run more than once.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "==> Seeding database..."
  npx tsx prisma/seed.ts
fi

# 3. Start the backend (which also serves the built frontend from ./public)
echo "==> Starting backend..."
exec node dist/src/main.js
