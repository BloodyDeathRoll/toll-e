#!/usr/bin/env bash
# Prepares a fresh Superset workspace: untracked env/config from the main checkout, then deps.
set -euo pipefail
root="${SUPERSET_ROOT_PATH:?SUPERSET_ROOT_PATH not set}"

# Untracked files the app needs (.env.local secrets, .vercel project link). Never overwrite.
for f in "$root"/.env*; do
  name="$(basename "$f")"
  [[ "$name" == *.example ]] && continue
  [[ -e "$name" ]] || { cp "$f" "$name"; echo "copied $name"; }
done
if [[ -d "$root/.vercel" && ! -e .vercel ]]; then cp -r "$root/.vercel" .vercel; echo "copied .vercel"; fi

pnpm install --frozen-lockfile

# Postgres (docker compose, container toll-e-db) is shared by all workspaces and not managed here.
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx toll-e-db; then
  echo "warning: toll-e-db is not running; start it from the main checkout: docker compose up -d"
fi
