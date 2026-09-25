#!/usr/bin/env bash
# Starts the dev server on the first free port from 3000 so parallel workspaces don't collide.
set -euo pipefail
port=3000
while (echo >"/dev/tcp/127.0.0.1/$port") 2>/dev/null; do port=$((port + 1)); done

# better-auth derives its origin from BETTER_AUTH_URL; point it at this workspace's port.
export BETTER_AUTH_URL="http://localhost:$port"
echo "toll-e dev server: $BETTER_AUTH_URL"
exec pnpm dev --port "$port"
