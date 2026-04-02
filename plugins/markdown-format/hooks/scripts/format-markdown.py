#!/usr/bin/env python3
"""PostToolUse hook: auto-fix markdown formatting in .md files."""

import json
import os
import sys

from fixers import run_pipeline


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

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            original = f.read()
    except (OSError, IOError):
        print(json.dumps({}))
        sys.exit(0)

    result, fixes = run_pipeline(original)

    if not fixes:
        print(json.dumps({}))
        sys.exit(0)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(result)

    filename = os.path.basename(file_path)
    fix_list = ", ".join(fixes)
    message = f"Markdown formatting: fixed {fix_list} in {filename}"
    print(json.dumps({"systemMessage": message}))
    sys.exit(0)


if __name__ == "__main__":
    main()
