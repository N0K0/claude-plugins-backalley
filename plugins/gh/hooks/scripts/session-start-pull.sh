#!/usr/bin/env bash
set -euo pipefail

# Read hook input from stdin (required by hook contract)
cat > /dev/null

# Delegate to Bun script — it handles all logic and outputs JSON to stdout
PLUGIN_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bun run "${PLUGIN_ROOT}/src/hooks/pull-existing.ts"
