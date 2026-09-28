#!/bin/sh
set -e

echo "[entrypoint] running migrations..."
pnpm migration:run

if [ "$NODE_ENV" = "production" ]; then
  echo "[entrypoint] starting bot in production mode..."
  exec pnpm start:prod
else
  echo "[entrypoint] starting bot in development mode (hot reload)..."
  exec pnpm start:dev
fi
