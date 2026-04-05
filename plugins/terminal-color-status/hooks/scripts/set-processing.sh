#!/usr/bin/env bash
# UserPromptSubmit hook: spawn background OSC loop to restore original color.
# A single OSC 11 write gets overridden by Claude Code's TUI rendering.
# The loop reapplies every 200ms to match the TUI's ~270ms render cadence.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    kill_loop "$STATE_FILE"
    start_loop "$ORIGINAL_COLOR" "$STATE_FILE"
fi

emit_ok
