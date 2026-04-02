#!/usr/bin/env bash
# SessionStart hook: detect OSC 11 support and save original background color.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

# Query terminal for current background color via OSC 11.
# Sends: ESC ] 11 ; ? BEL
# Expects: ESC ] 11 ; rgb:RRRR/GGGG/BBBB BEL (or ST terminator)
detect_osc_support() {
    local response=""

    # Send query to terminal
    printf '\e]11;?\a' > /dev/tty

    # Read response with 2-second timeout.
    # Terminal response contains escape sequences, so use -r and -d to read until
    # BEL (\a, 0x07) or backslash (ST terminator ends with \).
    # We read raw bytes with a timeout.
    if IFS= read -r -s -t 2 -d $'\a' response < /dev/tty 2>/dev/null; then
        : # Got BEL-terminated response
    elif IFS= read -r -s -t 2 -d '\\' response < /dev/tty 2>/dev/null; then
        : # Got ST-terminated response (best-effort, may not see data if first read consumed it)
    else
        # No response — terminal doesn't support OSC 11
        write_state "false" ""
        emit_ok
        return
    fi

    # Extract color value: everything after "11;" in the response.
    # Response looks like: ESC]11;rgb:RRRR/GGGG/BBBB
    local color
    color=$(printf '%s' "$response" | sed 's/.*11;//' | tr -d '[:cntrl:]')

    if [[ -n "$color" ]]; then
        write_state "true" "$color"
    else
        write_state "false" ""
    fi
    emit_ok
}

detect_osc_support
