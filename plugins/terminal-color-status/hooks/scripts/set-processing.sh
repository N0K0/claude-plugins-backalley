#!/usr/bin/env bash
# UserPromptSubmit / ElicitationResult hook: restore original background color.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    set_bg "$ORIGINAL_COLOR"
fi

emit_ok
