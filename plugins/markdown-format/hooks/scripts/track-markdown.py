#!/usr/bin/env python3
"""PostToolUse hook: record .md files touched for end-of-turn formatting."""

import json
import os
import sys
import tempfile


def tracking_file(session_id: str) -> str:
    sid = session_id or "unknown"
    safe = "".join(c for c in sid if c.isalnum() or c in "-_")
    return os.path.join(tempfile.gettempdir(), f"claude-md-format-{safe}.txt")


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        print(json.dumps({}))
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if not file_path.endswith(".md"):
        print(json.dumps({}))
        sys.exit(0)

    abs_path = os.path.abspath(file_path)
    path = tracking_file(input_data.get("session_id", ""))

    existing = set()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                existing = {line.strip() for line in f if line.strip()}
        except (OSError, IOError):
            pass

    existing.add(abs_path)

    try:
        with open(path, "w", encoding="utf-8") as f:
            for p in sorted(existing):
                f.write(p + "\n")
    except (OSError, IOError):
        pass

    print(json.dumps({}))
    sys.exit(0)


if __name__ == "__main__":
    main()
