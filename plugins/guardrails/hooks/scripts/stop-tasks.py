#!/usr/bin/env python3
"""Stop hook: block end-of-turn while TaskCreate tasks remain open."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import block, ok, read_input  # noqa: E402

BYPASS_SENTINEL = "[[guardrails:tasks-ok]]"
OPEN_STATUSES = {"pending", "in_progress"}


def reconstruct(transcript_path: str):
    """Walk the transcript and return (tasks_by_id, last_assistant_text)."""
    tasks: dict[str, dict] = {}
    pending_create: dict[str, str] = {}
    last_assistant_text = ""

    with open(transcript_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            msg = entry.get("message") or {}
            content = msg.get("content")
            if not isinstance(content, list):
                continue

            if entry.get("type") == "assistant":
                texts = [c.get("text", "") for c in content if c.get("type") == "text"]
                if texts:
                    last_assistant_text = "\n".join(texts)

            for c in content:
                ctype = c.get("type")
                if ctype == "tool_use":
                    name = c.get("name")
                    inp = c.get("input") or {}
                    if name == "TaskCreate":
                        subject = inp.get("subject", "")
                        pending_create[c.get("id", "")] = subject
                    elif name == "TaskUpdate":
                        tid = str(inp.get("taskId", ""))
                        status = inp.get("status")
                        if tid and tid in tasks and status:
                            tasks[tid]["status"] = status
                        elif tid and status:
                            tasks[tid] = {"subject": "(unknown)", "status": status}
                elif ctype == "tool_result":
                    use_id = c.get("tool_use_id", "")
                    if use_id in pending_create:
                        subject = pending_create.pop(use_id)
                        result = entry.get("toolUseResult") or {}
                        task = result.get("task") or {}
                        tid = str(task.get("id", ""))
                        if tid:
                            tasks[tid] = {"subject": subject, "status": "pending"}

    return tasks, last_assistant_text


def main() -> None:
    try:
        data = read_input()
        transcript_path = data.get("transcript_path", "")
        if not transcript_path or not os.path.isfile(transcript_path):
            ok()

        tasks, last_assistant_text = reconstruct(transcript_path)

        if BYPASS_SENTINEL in last_assistant_text:
            ok()

        open_tasks = [
            t for t in tasks.values() if t.get("status") in OPEN_STATUSES
        ]
        if not open_tasks:
            ok()

        subjects = ", ".join(f'"{t["subject"]}"' for t in open_tasks[:5])
        if len(open_tasks) > 5:
            subjects += f" (and {len(open_tasks) - 5} more)"

        block(
            f"Tasks still open: {subjects}. Mark them completed or deleted before "
            f"stopping. If the work is genuinely paused, run TaskUpdate to set them "
            f"to deleted with a brief note. To bypass this check intentionally, "
            f"include {BYPASS_SENTINEL} in your final message."
        )
    except Exception:
        ok()


if __name__ == "__main__":
    main()
