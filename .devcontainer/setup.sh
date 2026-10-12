#!/usr/bin/env bash
# Runs once when the codespace is created (and can be re-run after pulling new commits):
# install dependencies, build the app, apply database migrations. Never deletes data.
set -euo pipefail
cd "$(dirname "$0")/.."
. .devcontainer/env.sh

# The data volume is created root-owned; give it to the container user (no-op afterwards).
sudo mkdir -p "$FLOWDECK_DATA_DIR/uploads"
sudo chown -R "$(id -u):$(id -g)" "$FLOWDECK_DATA_DIR"

echo "Installing dependencies…"
npm ci --no-audit --no-fund
echo "Building Flowdeck…"
npm run build
echo "Waiting for PostgreSQL…"
node .devcontainer/wait-for-db.mjs
echo "Applying database migrations (forward-only; existing data is kept)…"
node dist/server/cli.js migrate
echo "Setup complete. Flowdeck starts automatically; see README → Try Flowdeck in your browser."
