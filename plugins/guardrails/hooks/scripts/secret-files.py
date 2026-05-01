#!/usr/bin/env python3
"""PreToolUse(Write|Edit): refuse writes to likely secret files."""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import block, ok, read_input  # noqa: E402

BASENAME_PATTERNS = [
    re.compile(r"^\.env(\.[A-Za-z0-9._-]+)?$"),
    re.compile(r"^credentials\.json$"),
    re.compile(r"^client_secret.*\.json$"),
    re.compile(r"^id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$"),
    re.compile(r".*\.(pem|key|p12|pfx|crt|cer)$", re.IGNORECASE),
]
DIR_PATTERNS = [
    re.compile(r"(^|/)\.?secrets?(/|$)"),
]


def is_secret_path(path: str) -> bool:
    base = os.path.basename(path)
    if any(p.match(base) for p in BASENAME_PATTERNS):
        return True
    if any(p.search(path) for p in DIR_PATTERNS):
        return True
    return False


def main() -> None:
    try:
        data = read_input()
        path = (data.get("tool_input") or {}).get("file_path", "")
        if not isinstance(path, str) or not path:
            ok()
        if is_secret_path(path):
            block(
                f"Refusing to write to a likely secret file ({path}). "
                "If this is intentional, ask the user to make the edit."
            )
        ok()
    except Exception:
        ok()


if __name__ == "__main__":
    main()
