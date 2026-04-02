#!/usr/bin/env bash
# SessionEnd hook: restore original background color and remove state file.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    printf '\e]11;%s\a' "$ORIGINAL_COLOR" > /dev/tty
fi

# Clean up state file
rm -f "${STATE_FILE}"

emit_ok
