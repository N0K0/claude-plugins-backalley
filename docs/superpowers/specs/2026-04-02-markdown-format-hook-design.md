# Markdown Format Hook — Design Spec

**Issue:** #116
**Date:** 2026-04-02

## Summary

A PostToolUse hook plugin that automatically fixes common markdown formatting issues when Claude writes or edits `.md` files. Returns a systemMessage describing what was fixed so Claude can self-correct during the session.

## Plugin Structure

```
plugins/markdown-format/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       └── format-markdown.py
├── README.md
└── LICENSE
```

## Hook Configuration

- **Hook type:** PostToolUse
- **Matchers:** `Write`, `Edit`
- **Language:** Python 3 (no external dependencies)
- **Timeout:** 10 seconds

The hook triggers after every Write or Edit tool call. The Python script checks if the affected file is `.md` — if not, it exits immediately with empty JSON.

## Formatting Rules

The script applies these fixers in order as a pipeline. Each fixer is a standalone function: `str -> str`.

1. **Table alignment** — Detect markdown tables, normalize column widths by padding cells with spaces, ensure delimiter rows use proper `---` alignment syntax.
2. **Trailing whitespace** — Remove trailing spaces/tabs from all lines (preserving intentional double-space line breaks).
3. **Blank lines around fenced code blocks** — Ensure a blank line before and after ``` fences.
4. **Blank lines around headings** — Ensure a blank line before and after `#` headings (except at file start).
5. **Consistent list markers** — Normalize unordered lists to `-` (Claude sometimes mixes `-`, `*`, `+`).

## Script Flow

1. Read JSON from stdin, extract `tool_input.file_path`.
2. Check file ends with `.md` — if not, exit with `{}`.
3. Read file content from disk. If file doesn't exist or can't be read, exit with `{}`.
4. Run fixer pipeline: tables -> trailing whitespace -> code block blanks -> heading blanks -> list markers.
5. Compare original vs result. If no changes, exit with `{}`.
6. Write fixed content back to disk.
7. Exit with `{"systemMessage": "Markdown formatting: fixed <list of fixers that changed something> in <filename>"}`.

Exit code is always 0 (PostToolUse cannot block — the write already happened).

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Hook type | PostToolUse | Simpler than intercepting tool input; fix the file on disk after the write |
| Scope | All `.md` files | Start simple; add exclusions later if needed |
| Language | Python 3 | Clean string manipulation for table parsing; no external deps |
| Feedback | systemMessage | Cheap to implement; helps Claude self-correct during session |
| Implementation | Custom fixers | No external dependencies; full control over the curated rule set |
