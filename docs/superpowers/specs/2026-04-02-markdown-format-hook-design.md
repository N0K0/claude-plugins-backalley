# Markdown Format Hook — Design Spec

**Issue:** #116
**Date:** 2026-04-02

## Summary

A PostToolUse hook plugin that automatically fixes common markdown formatting issues when Claude writes or edits `.md` files. Returns a systemMessage describing what was fixed so Claude can self-correct during the session.

## Non-Goals

- Full CommonMark compliance or linting
- Link validation, spell checking
- Fixing markdown inside non-`.md` files
- Configurable rule sets or exclusion lists (can be added later)

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

### Stdin Payload

Both `Write` and `Edit` provide the file path at `tool_input.file_path`. Example stdin for a Write call:

```json
{
  "session_id": "abc123",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.md",
    "content": "..."
  }
}
```

For Edit, same structure but `tool_input` contains `file_path`, `old_string`, `new_string`.

## Critical Invariant: Fenced Code Block Exclusion

**All fixers MUST skip content inside fenced code blocks** (lines between ``` or ~~~ delimiters). Before running the fixer pipeline, the script identifies fenced code block regions and excludes them. Fixers only operate on lines outside these regions.

## Formatting Rules

The script applies these fixers in order as a pipeline. Each fixer is a standalone function: `str -> str`. All files are read and written as UTF-8 (explicit `encoding="utf-8"` on all `open()` calls).

### 1. Table Alignment

Detect markdown tables and normalize formatting:
- Pad all cells to the width of the widest cell in each column, using spaces.
- Normalize delimiter rows: left-align `:---`, center `:-:`, right `---:`. Detect alignment from the existing delimiter row and preserve it. Default to left-align if no colons present.
- **Malformed rows:** If a row has fewer columns than the header, pad with empty cells. If more columns, truncate to header column count.
- **Tables inside blockquotes:** Fix tables that appear after `>` prefixes (strip prefix, fix, re-add prefix).

### 2. Trailing Whitespace

Remove trailing spaces and tabs from all lines. **Exception:** Exactly two trailing spaces before a newline are preserved (intentional line break). Three or more trailing spaces are reduced to two.

### 3. Blank Lines Around Fenced Code Blocks

Ensure exactly one blank line before and after ``` / ~~~ fence delimiters. Does not add a blank line at file start or before the first line of the file.

### 4. Blank Lines Around Headings

Ensure exactly one blank line before and after `#` headings. **Exceptions:**
- No blank line added at file start (heading can be first line).
- YAML frontmatter (`---` delimited) is recognized and left alone — no blank line injected between frontmatter closing `---` and the first heading.

### 5. Consistent List Markers

Replace `*` and `+` unordered list markers with `-`. Only changes the marker character — all indentation is preserved as-is. Does not affect ordered lists.

## Script Flow

1. Read JSON from stdin, extract `tool_input.file_path`.
2. Check file ends with `.md` — if not, exit with `{}`.
3. Read file content from disk (UTF-8). If file doesn't exist or can't be read, exit with `{}`.
4. Identify fenced code block regions (line ranges to exclude from fixing).
5. Run fixer pipeline: tables -> trailing whitespace -> code block blanks -> heading blanks -> list markers.
6. Compare original vs result. If no changes, exit with `{}`.
7. Write fixed content back to disk (UTF-8).
8. Exit with systemMessage. Example: `{"systemMessage": "Markdown formatting: fixed table alignment, trailing whitespace in README.md"}`

Exit code is always 0 (PostToolUse cannot block — the write already happened).

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Hook type | PostToolUse | Simpler than intercepting tool input; fix the file on disk after the write |
| Scope | All `.md` files | Start simple; add exclusions later if needed |
| Language | Python 3 | Clean string manipulation for table parsing; no external deps |
| Feedback | systemMessage | Cheap to implement; helps Claude self-correct during session |
| Implementation | Custom fixers | No external dependencies; full control over the curated rule set |
| Encoding | UTF-8 explicit | Avoids locale-dependent behavior across systems |
