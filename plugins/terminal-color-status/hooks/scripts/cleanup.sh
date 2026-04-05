#!/usr/bin/env bash
# SessionEnd hook: kill OSC loop, restore original background color, remove state.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    kill_loop "$STATE_FILE"
    printf '\e]11;%s\a' "$ORIGINAL_COLOR" > /dev/tty 2>/dev/null
fi

# Clean up state file
rm -f "${STATE_FILE}"

emit_ok
