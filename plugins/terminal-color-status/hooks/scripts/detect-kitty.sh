#!/usr/bin/env bash
# SessionStart hook: detect kitty remote control support and save original color.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

local_colors=$(kitty @ get-colors 2>/dev/null)
local_bg=$(printf '%s\n' "$local_colors" | grep '^background' | awk '{print $2}')

if [[ -n "$local_bg" ]]; then
    # If background is a leftover tint from ungraceful exit, use default
    if [[ "$local_bg" == "$READY_COLOR" || "$local_bg" == "$ELICIT_COLOR" ]]; then
        write_state "true" "$DEFAULT_BG"
        set_bg "$DEFAULT_BG"
    else
        write_state "true" "$local_bg"
    fi
else
    write_state "false" ""
fi

emit_ok
