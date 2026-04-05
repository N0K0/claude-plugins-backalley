#!/usr/bin/env bash
# Stop hook: set terminal background to "ready" tint color.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]]; then
    set_bg "$READY_COLOR"
fi

emit_ok
