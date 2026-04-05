#!/usr/bin/env bash
# Stop hook: kill background OSC loop, set terminal background to "ready" tint.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]]; then
    kill_loop "$STATE_FILE"
    printf '\e]11;%s\a' "$READY_COLOR" > /dev/tty 2>/dev/null
fi

emit_ok
