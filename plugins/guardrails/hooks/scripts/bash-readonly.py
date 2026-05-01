#!/usr/bin/env python3
"""PreToolUse(Bash): redirect bare cat/head/tail/sed/awk to Read/Edit."""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import block, ok, read_input  # noqa: E402

BLOCKED = {"cat", "head", "tail", "sed", "awk"}
FIRST_WORD = re.compile(r"^\s*(?:sudo\s+)?([A-Za-z0-9_./-]+)")


def main() -> None:
    try:
        data = read_input()
        cmd = (data.get("tool_input") or {}).get("command", "")
        if not isinstance(cmd, str) or not cmd.strip():
            ok()

        if "|" in cmd or "<<" in cmd or "<<<" in cmd:
            ok()

        m = FIRST_WORD.match(cmd)
        if not m:
            ok()
        first = os.path.basename(m.group(1))
        if first not in BLOCKED:
            ok()

        if first in {"sed", "awk"}:
            tool_hint = "the Edit tool for in-place edits or the Read tool to read file contents"
        else:
            tool_hint = "the Read tool to read file contents"
        block(
            f"Use {tool_hint} instead of `{first}`. "
            f"The {first} CLI is reserved for piped/composed shell use."
        )
    except Exception:
        ok()


if __name__ == "__main__":
    main()
