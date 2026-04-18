#!/usr/bin/env python3
"""Stop hook: format .md files tracked during this session's turn."""

import json
import os
import sys
import tempfile

from fixers import run_pipeline


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

    path = tracking_file(input_data.get("session_id", ""))

    if not os.path.exists(path):
        print(json.dumps({}))
        sys.exit(0)

    try:
        with open(path, "r", encoding="utf-8") as f:
            paths = [line.strip() for line in f if line.strip()]
    except (OSError, IOError):
        print(json.dumps({}))
        sys.exit(0)

    try:
        os.remove(path)
    except OSError:
        pass

    messages = []
    for file_path in paths:
        if not file_path.endswith(".md"):
            continue
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                original = f.read()
        except (OSError, IOError):
            continue

        result, fixes = run_pipeline(original)
        if not fixes:
            continue

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(result)
        except (OSError, IOError):
            continue

        messages.append(f"{', '.join(fixes)} in {os.path.basename(file_path)}")

    if messages:
        print(json.dumps({"systemMessage": "Markdown formatting: fixed " + "; ".join(messages)}))
    else:
        print(json.dumps({}))
    sys.exit(0)


if __name__ == "__main__":
    main()
