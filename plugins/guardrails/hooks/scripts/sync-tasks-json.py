#!/usr/bin/env python3
"""Stop hook: sync completed tasks to tasks.json (safety-net, never blocks)."""

import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ok, read_input  # noqa: E402

TASKS_JSON_RE = re.compile(r'(\.issues/|docs/specs/).+\.tasks\.json$')


def reconstruct(transcript_path: str):
    """Return (tasks_by_id, tasks_json_path) from transcript.

    tasks_by_id: {nativeId: {"subject": str, "status": str}}
    tasks_json_path: most-recent absolute path to a *.tasks.json file seen in transcript
    """
    tasks: dict[str, dict] = {}
    pending_create: dict[str, str] = {}
    tasks_json_path = ""

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

            for c in content:
                ctype = c.get("type")
                if ctype != "tool_use":
                    if ctype == "tool_result":
                        use_id = c.get("tool_use_id", "")
                        if use_id in pending_create:
                            subject = pending_create.pop(use_id)
                            result = entry.get("toolUseResult") or {}
                            task = result.get("task") or {}
                            tid = str(task.get("id", ""))
                            if tid:
                                tasks[tid] = {"subject": subject, "status": "pending"}
                    continue

                name = c.get("name")
                inp = c.get("input") or {}

                if name == "TaskCreate":
                    pending_create[c.get("id", "")] = inp.get("subject", "")
                elif name == "TaskUpdate":
                    tid = str(inp.get("taskId", ""))
                    status = inp.get("status")
                    if tid and status:
                        if tid in tasks:
                            tasks[tid]["status"] = status
                        else:
                            tasks[tid] = {"subject": "(unknown)", "status": status}
                elif name in ("Write", "Read"):
                    path = inp.get("file_path", "")
                    if TASKS_JSON_RE.search(path):
                        tasks_json_path = path

    return tasks, tasks_json_path


def main() -> None:
    try:
        data = read_input()
        transcript_path = data.get("transcript_path", "")
        if not transcript_path or not os.path.isfile(transcript_path):
            ok()

        tasks, tasks_json_path = reconstruct(transcript_path)

        if not tasks_json_path or not os.path.isfile(tasks_json_path):
            ok()

        completed_ids = {tid for tid, t in tasks.items() if t.get("status") == "completed"}
        if not completed_ids:
            ok()

        with open(tasks_json_path, "r", encoding="utf-8") as f:
            tasks_file = json.load(f)

        changed = False
        for entry in tasks_file.get("tasks", []):
            if entry.get("nativeId") in completed_ids and entry.get("status") != "completed":
                entry["status"] = "completed"
                changed = True

        if changed:
            tasks_file["lastUpdated"] = datetime.now(timezone.utc).isoformat()
            with open(tasks_json_path, "w", encoding="utf-8") as f:
                json.dump(tasks_file, f, indent=2)
    except Exception:
        pass

    ok()


if __name__ == "__main__":
    main()
