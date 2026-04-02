#!/usr/bin/env bash
# Shared utilities for terminal-color-status hook scripts.
# Sourced by each hook script — not executed directly.

set -euo pipefail

READY_COLOR="#001a0a"
DEFAULT_BG="#232627"
STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}"

# Normalize a color to 6-digit hex (#rrggbb) for comparison.
# Handles: #RRGGBB, rgb:RRRR/GGGG/BBBB, rgb:RR/GG/BB
normalize_color() {
    local c="$1"
    if [[ "$c" =~ ^#[0-9a-fA-F]{6}$ ]]; then
        printf '%s' "$c" | tr '[:upper:]' '[:lower:]'
    elif [[ "$c" =~ ^rgb: ]]; then
        # Strip "rgb:" prefix, split on /
        local raw="${c#rgb:}"
        local r g b
        IFS='/' read -r r g b <<< "$raw"
        # Take first 2 hex digits of each component (handles both RR and RRRR)
        printf '#%s%s%s' "${r:0:2}" "${g:0:2}" "${b:0:2}" | tr '[:upper:]' '[:lower:]'
    else
        printf '%s' "$c" | tr '[:upper:]' '[:lower:]'
    fi
}

# Check if a detected color matches our ready tint (leftover from previous session).
is_ready_color() {
    local detected
    detected=$(normalize_color "$1")
    local ready
    ready=$(normalize_color "$READY_COLOR")
    [[ "$detected" == "$ready" ]]
}

# Parse session_id from hook input JSON on stdin.
# Sets SESSION_ID and STATE_FILE globals.
parse_input() {
    local input
    input=$(cat)
    SESSION_ID=$(printf '%s' "$input" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:.*"\([^"]*\)"/\1/')
    if [[ -z "${SESSION_ID:-}" ]]; then
        echo '{}'
        exit 0
    fi
    STATE_FILE="${STATE_DIR}/terminal-color-status-${SESSION_ID}"
}

# Read state file into SUPPORTED and ORIGINAL_COLOR globals.
# Uses grep/cut instead of source to avoid shell injection.
# Returns 1 if state file doesn't exist.
read_state() {
    if [[ ! -f "${STATE_FILE}" ]]; then
        return 1
    fi
    SUPPORTED=$(grep '^supported=' "${STATE_FILE}" | cut -d= -f2-)
    ORIGINAL_COLOR=$(grep '^original_color=' "${STATE_FILE}" | cut -d= -f2-)
    SUPPORTED="${SUPPORTED:-false}"
}

# Write state to state file with restrictive permissions.
write_state() {
    local sup="$1"
    local color="$2"
    (umask 077; cat > "${STATE_FILE}" <<STATEEOF
supported=${sup}
original_color=${color}
STATEEOF
    )
}

# Emit empty JSON to stdout (required hook output).
emit_ok() {
    echo '{}'
}
