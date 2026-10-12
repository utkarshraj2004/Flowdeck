#!/usr/bin/env bash
# Creates the first Flowdeck administrator and prints a one-time setup link (valid 24 h)
# that opens on this codespace's private forwarded address.
# Usage: bash .devcontainer/create-admin.sh you@example.com
set -euo pipefail
cd "$(dirname "$0")/.."
. .devcontainer/env.sh
EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Usage: bash .devcontainer/create-admin.sh you@example.com"
  exit 1
fi
node dist/server/cli.js admin create --email "$EMAIL"
echo "If the page does not open, make sure Flowdeck is running: bash .devcontainer/start.sh"
