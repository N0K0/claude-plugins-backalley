"""Shared helpers for guardrails hook scripts."""

import json
import sys
from typing import NoReturn


def read_input() -> dict:
    try:
        return json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return {}


def block(reason: str) -> NoReturn:
    print(json.dumps({"decision": "block", "reason": reason}))
    sys.exit(0)


def ok() -> NoReturn:
    print("{}")
    sys.exit(0)
