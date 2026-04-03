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

# Write state to state file atomically with restrictive permissions.
# Uses tmp+mv to prevent partial reads by concurrent hooks.
write_state() {
    local sup="$1"
    local color="$2"
    local pid="${3:-}"
    local tmp="${STATE_FILE}.tmp.$$"
    (umask 077; cat > "$tmp" <<STATEEOF
supported=${sup}
original_color=${color}
loop_pid=${pid}
STATEEOF
    )
    mv "$tmp" "${STATE_FILE}"
}

# Update only the loop_pid field in the state file atomically.
update_loop_pid() {
    local state_file="$1"
    local new_pid="$2"
    local sup orig
    sup=$(grep '^supported=' "$state_file" 2>/dev/null | cut -d= -f2-)
    orig=$(grep '^original_color=' "$state_file" 2>/dev/null | cut -d= -f2-)
    local tmp="${state_file}.tmp.$$"
    (umask 077; cat > "$tmp" <<STATEEOF
supported=${sup}
original_color=${orig}
loop_pid=${new_pid}
STATEEOF
    )
    mv "$tmp" "$state_file"
}

# Kill the background OSC loop if running. Waits up to 250ms for death.
kill_loop() {
    local state_file="$1"
    local pid
    pid=$(grep '^loop_pid=' "$state_file" 2>/dev/null | cut -d= -f2-)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null
        local i
        for i in 1 2 3 4 5; do
            kill -0 "$pid" 2>/dev/null || break
            sleep 0.05
        done
    fi
    update_loop_pid "$state_file" ""
}

# Spawn a detached background loop that writes OSC 11 every 200ms.
# The loop exits when /dev/tty fails or when killed by kill_loop.
start_loop() {
    local color="$1"
    local state_file="$2"
    ( trap 'exit 0' TERM
      while true; do
          printf '\e]11;%s\a' "$color" > /dev/tty 2>/dev/null || exit 1
          sleep 0.2
      done
    ) </dev/null >/dev/null 2>&1 &
    local pid=$!
    disown "$pid" 2>/dev/null
    update_loop_pid "$state_file" "$pid"
}

# Emit empty JSON to stdout (required hook output).
emit_ok() {
    echo '{}'
}
