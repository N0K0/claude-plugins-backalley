#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"

# Check for jq
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not found. Install it with your package manager." >&2
    exit 1
fi

# Load existing categories (keyed by plugin name)
declare -A CATEGORIES
if [[ -f "$MARKETPLACE" ]]; then
    while IFS='=' read -r key val; do
        CATEGORIES["$key"]="$val"
    done < <(jq -r '.plugins[]? | "\(.name)=\(.category // "")"' "$MARKETPLACE")
fi

# Read top-level fields from existing marketplace.json (or defaults)
TOP_LEVEL=$(jq '{
    "$schema": ."$schema",
    name: .name,
    description: .description,
    owner: .owner
}' "$MARKETPLACE" 2>/dev/null || echo '{}')

# Build plugins array
PLUGINS="[]"
for plugin_json in "$REPO_ROOT"/plugins/*/.claude-plugin/plugin.json; do
    [[ -f "$plugin_json" ]] || continue

    dir_name=$(basename "$(dirname "$(dirname "$plugin_json")")")
    source="./plugins/$dir_name"

    # Extract fields from plugin.json
    entry=$(jq --arg source "$source" '{
        name: .name,
        description: .description,
        author: .author,
        source: $source
    }' "$plugin_json")

    # Merge preserved category if it exists
    plugin_name=$(jq -r '.name' "$plugin_json")
    if [[ -n "${CATEGORIES[$plugin_name]:-}" ]]; then
        entry=$(echo "$entry" | jq --arg cat "${CATEGORIES[$plugin_name]}" '. + {category: $cat}')
    fi

    PLUGINS=$(echo "$PLUGINS" | jq --argjson entry "$entry" '. + [$entry]')
done

# Assemble final marketplace.json
echo "$TOP_LEVEL" | jq --argjson plugins "$PLUGINS" '. + {plugins: $plugins}' > "$MARKETPLACE"

echo "Generated $MARKETPLACE with $(echo "$PLUGINS" | jq 'length') plugin(s)."
