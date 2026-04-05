#!/usr/bin/env bash
# Elicitation hook: set terminal background to "needs input" tint.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]]; then
    set_bg "$ELICIT_COLOR"
fi

emit_ok
