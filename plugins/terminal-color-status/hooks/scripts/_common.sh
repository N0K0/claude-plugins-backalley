#!/usr/bin/env bash
# Shared utilities for terminal-color-status hook scripts.
# Sourced by each hook script — not executed directly.

set -euo pipefail

READY_COLOR="#001a0a"
ELICIT_COLOR="#1a1a00"
DEFAULT_BG="#232627"
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
read_state() {
    if [[ ! -f "${STATE_FILE}" ]]; then
        return 1
    fi
    SUPPORTED=$(grep '^supported=' "${STATE_FILE}" | cut -d= -f2-)
    ORIGINAL_COLOR=$(grep '^original_color=' "${STATE_FILE}" | cut -d= -f2-)
    SUPPORTED="${SUPPORTED:-false}"
}

# Write state file atomically.
write_state() {
    local sup="$1"
    local color="$2"
    local tmp="${STATE_FILE}.tmp.$$"
    (umask 077; cat > "$tmp" <<STATEEOF
supported=${sup}
original_color=${color}
STATEEOF
    )
    mv "$tmp" "${STATE_FILE}"
}

# Set terminal background color via kitty remote control IPC.
# Uses Unix socket — bypasses the terminal character stream entirely,
# so it works even during Claude Code's active TUI rendering.
# Targets only the current window via KITTY_WINDOW_ID.
set_bg() {
    local color="$1"
    if [[ -n "${KITTY_WINDOW_ID:-}" ]]; then
        kitty @ set-colors --match "id:${KITTY_WINDOW_ID}" background="$color" 2>/dev/null || true
    fi
}

# Emit empty JSON to stdout (required hook output).
emit_ok() {
    echo '{}'
}
