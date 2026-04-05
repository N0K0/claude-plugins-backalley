#!/usr/bin/env bash
# SessionStart hook: detect kitty remote control support and save original color.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

# Check if kitty remote control is available by querying colors.
if kitty @ get-colors 2>/dev/null | grep -q '^background'; then
    # Extract current background color
    local_bg=$(kitty @ get-colors 2>/dev/null | grep '^background' | awk '{print $2}')
    if [[ -n "$local_bg" ]]; then
        # If background is our ready color (leftover from ungraceful exit), use default
        if [[ "$local_bg" == "$READY_COLOR" ]]; then
            write_state "true" "$DEFAULT_BG"
            set_bg "$DEFAULT_BG"
        else
            write_state "true" "$local_bg"
        fi
    else
        write_state "false" ""
    fi
else
    write_state "false" ""
fi

emit_ok
