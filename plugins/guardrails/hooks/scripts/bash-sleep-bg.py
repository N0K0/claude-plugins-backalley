#!/usr/bin/env python3
"""PreToolUse(Bash): block `sleep N; cmd` / `sleep N && cmd` chains."""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import block, ok, read_input  # noqa: E402

LEADING_SLEEP = re.compile(r"^\s*sleep\s+\d+(?:\.\d+)?\s*[;&]+\s*\S")
EMBEDDED_SLEEP = re.compile(r"[;&]+\s*sleep\s+\d+(?:\.\d+)?\s*[;&]+\s*\S")

REASON = (
    "Don't chain sleep with another command. Use run_in_background: true on the "
    "long-running command and poll with TaskOutput, or use ScheduleWakeup for delayed "
    "checks. Inline sleep blocks the assistant from doing other work."
)


def main() -> None:
    try:
        data = read_input()
        cmd = (data.get("tool_input") or {}).get("command", "")
        if not isinstance(cmd, str):
            ok()
        head = cmd[:200]
        if LEADING_SLEEP.search(head) or EMBEDDED_SLEEP.search(head):
            block(REASON)
        ok()
    except Exception:
        ok()


if __name__ == "__main__":
    main()
