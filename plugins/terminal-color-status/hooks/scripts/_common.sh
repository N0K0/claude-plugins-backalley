#!/usr/bin/env bash
# Shared utilities for terminal-color-status hook scripts.
# Sourced by each hook script — not executed directly.

set -euo pipefail

READY_COLOR="#001a0a"
STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}"

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
# Returns 1 if state file doesn't exist.
read_state() {
    if [[ ! -f "${STATE_FILE}" ]]; then
        return 1
    fi
    # shellcheck source=/dev/null
    source "${STATE_FILE}"
    SUPPORTED="${supported:-false}"
    ORIGINAL_COLOR="${original_color:-}"
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
