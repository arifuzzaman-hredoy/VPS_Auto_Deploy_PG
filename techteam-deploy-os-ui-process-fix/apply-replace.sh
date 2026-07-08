#!/usr/bin/env bash
set -euo pipefail
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$PATCH_DIR")"
echo "Applying TechTeam Deploy OS UI process fix..."
cp -R "$PATCH_DIR/files/." "$PROJECT_DIR/"
echo "Done. Now run: npm run build"
