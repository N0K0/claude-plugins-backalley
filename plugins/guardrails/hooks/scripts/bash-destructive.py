#!/usr/bin/env python3
"""PreToolUse(Bash): block common destructive operations."""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import block, ok, read_input  # noqa: E402

RM_RF = re.compile(r"\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b")
GIT_PUSH_FORCE = re.compile(r"\bgit\s+push\b[^\n]*--force(?:-with-lease)?\b")
GIT_RESET_HARD = re.compile(r"\bgit\s+reset\s+--hard\b")
GIT_CHECKOUT_DOT = re.compile(r"\bgit\s+(?:checkout|restore)\s+\.")
GIT_CLEAN_F = re.compile(r"\bgit\s+clean\s+-[a-zA-Z]*f")
GIT_NO_VERIFY = re.compile(r"\bgit\s+commit\b[^\n]*--no-verify\b")
PROTECTED_BRANCH = re.compile(r"\b(?:origin/)?(?:main|master)\b")


def main() -> None:
    try:
        data = read_input()
        cmd = (data.get("tool_input") or {}).get("command", "")
        if not isinstance(cmd, str) or not cmd.strip():
            ok()

        if RM_RF.search(cmd):
            block(
                "rm -rf is destructive and easy to misfire. Confirm with the user "
                "or narrow the path; consider `trash` or moving to a temp dir instead."
            )
        if GIT_PUSH_FORCE.search(cmd) and PROTECTED_BRANCH.search(cmd):
            block(
                "Force-pushing to main/master can overwrite shared history. "
                "Push to a feature branch, or confirm with the user first."
            )
        if GIT_RESET_HARD.search(cmd):
            block(
                "git reset --hard discards uncommitted changes. Confirm with the user, "
                "or use `git stash` / a feature branch to preserve work."
            )
        if GIT_CHECKOUT_DOT.search(cmd):
            block(
                "`git checkout/restore .` discards all unstaged changes. "
                "Target specific files or confirm with the user first."
            )
        if GIT_CLEAN_F.search(cmd):
            block(
                "`git clean -f` permanently deletes untracked files. "
                "Run `git clean -n` first to preview, or confirm with the user."
            )
        if GIT_NO_VERIFY.search(cmd):
            block(
                "Don't bypass hooks with --no-verify. Investigate and fix the failing "
                "hook instead, or ask the user if the bypass is intentional."
            )
        ok()
    except Exception:
        ok()


if __name__ == "__main__":
    main()
