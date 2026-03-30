# Spec: `issue_pull`, `issue_push`, and `issue_diff` MCP tools

**Date:** 2026-03-30
**Issue:** #118
**Plugin:** `plugins/gh`

## Problem

Editing a GitHub issue body via MCP is token-expensive. `issue_get` returns the full body into context, then `issue_update` sends the full body back out as a parameter. For large specs, the body traverses the context window twice plus Claude must reason about the edit inline.

Additionally, there's no way to preview what changed locally before pushing, risking accidental overwrites of remote changes.

## Solution

Three new MCP tools that use the local filesystem as an intermediary:

- **`issue_pull`** — fetches issue(s) and writes them as markdown files with YAML frontmatter
- **`issue_push`** — reads pulled markdown file(s), parses frontmatter + body, and PATCHes the issue(s)
- **`issue_diff`** — compares local file(s) against current GitHub state, reports changes

Claude uses the standard `Read`/`Edit` tools (already optimized for minimal token usage) to modify files between pull and push, and `issue_diff` to review before pushing.

## Shared frontmatter format

All three tools share a common markdown format:

```yaml
---
number: 11
title: "Skill: development process"
state: open
labels:
  - backlog
  - skill
milestone: null
assignees: []
url: "https://github.com/N0K0/claude-plugins-backalley/issues/11"
pulled_at: "2026-03-30T17:30:00Z"
---

Body content here...
```

**Frontmatter field types:**
- `number`: integer (required, identifies the issue — not pushed)
- `title`: string
- `state`: `open` | `closed`
- `labels`: YAML list of strings
- `milestone`: integer or null (milestone number, not title — note: the `issue_pull` *parameter* accepts string values like `"*"` and `"none"` for filtering, matching the GitHub API, but the *frontmatter* field stores the resolved milestone number or null)
- `assignees`: YAML list of strings (GitHub usernames)
- `url`: string (html_url, informational — not pushed)
- `pulled_at`: ISO 8601 timestamp of when the issue was pulled (set by `issue_pull`, used by `issue_diff` to detect remote changes — not pushed)

**File naming:** `{path}/issue-{number}.md`

## Shared helper module: `src/tools/issue-files.ts`

Exports:
- `serializeIssue(raw)` → markdown string with YAML frontmatter. Takes a raw GitHub API issue object (pre-slim) and extracts the needed fields internally.
- `parseIssueFile(content)` → `{ frontmatter, body }` with typed fields
- `issueFilePath(dir, number)` → `{dir}/issue-{number}.md`

Uses the `yaml` package (`eemeli/yaml`) for both stringify and parse.

## `issue_pull`

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | string | no | Defaults to detected repo |
| `repo` | string | no | Defaults to detected repo |
| `issue_number` | number | no | Pull a single issue |
| `labels` | string | no | Comma-separated label names |
| `state` | `open`\|`closed`\|`all` | no | Default: `open` |
| `milestone` | string | no | Milestone number, `*`, or `none` |
| `assignee` | string | no | Username or `none` (matches `issue_list`) |
| `path` | string | yes | Absolute path to output directory |

### Behavior

- If `issue_number` provided → fetch that single issue, ignore filter params
- Otherwise → fetch all matching issues (defaults to all open issues when no filters given)
- Creates directory if it doesn't exist
- Writes each issue as `issue-{number}.md`
- Overwrites existing files silently (fresh snapshot)
- Fetches all pages (loops with `per_page=100` until exhausted)

### Return value

```json
{
  "path": "/abs/path/.gh-issues",
  "files": [
    { "path": "/abs/path/.gh-issues/issue-11.md", "number": 11, "title": "..." }
  ]
}
```

## `issue_push`

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | string | no | Defaults to detected repo |
| `repo` | string | no | Defaults to detected repo |
| `path` | string | yes | Path to a file or directory |

### Behavior

- If `path` is a file → push that single issue
- If `path` is a directory → find all `issue-*.md` files, push each one
- Reads file, parses frontmatter, extracts body
- PATCHes the issue via GitHub API

### Fields pushed

All frontmatter fields except `number`, `url`, and `pulled_at`:
- `title` → API `title`
- `state` → API `state`
- `labels` → API `labels` (string array)
- `milestone` → API `milestone` (number or null)
- `assignees` → API `assignees` (string array)
- Body content → API `body`

### Return value

```json
{
  "results": [
    { "number": 11, "title": "Skill: development process", "html_url": "https://..." }
  ]
}
```

### Error handling

- File doesn't exist → error (single-file mode)
- No `number` in frontmatter → per-file error
- Frontmatter parse failure → per-file error with details
- API failure → per-file error, pass through GitHub error message
- **Directory mode uses continue-on-error**: processes all files, collects errors per-file

### Return value (with errors)

```json
{
  "results": [
    { "number": 11, "title": "Skill: development process", "html_url": "https://..." }
  ],
  "errors": [
    { "file": "issue-99.md", "error": "No number in frontmatter" }
  ]
}
```

## `issue_diff`

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `owner` | string | no | Defaults to detected repo |
| `repo` | string | no | Defaults to detected repo |
| `path` | string | yes | Path to a file or directory |

### Behavior

- If `path` is a file → diff that single issue
- If `path` is a directory → diff all `issue-*.md` files
- For each file: fetches the current issue from GitHub, compares frontmatter fields and body
- Reports per-issue:
  - Changed fields (e.g., `title: "old" → "new"`, `labels: +bug -backlog`)
  - Whether body changed (line count summary)
  - Whether remote is newer (remote `updated_at` > `pulled_at` from frontmatter) — flags as warning
- Issues with no local changes reported as "up to date"
- Body comparison: compare as strings; if different, report the count of added and removed lines

### Return value

```json
{
  "diffs": [
    {
      "number": 11,
      "title": "Skill: development process",
      "status": "modified",
      "changes": ["title changed", "labels: +bug", "body: 12 lines changed"],
      "remote_newer": false
    },
    {
      "number": 9,
      "title": "CVE hunting",
      "status": "up_to_date",
      "changes": [],
      "remote_newer": true
    }
  ]
}
```

The `remote_newer: true` flag warns that GitHub has changes not reflected locally — pushing would overwrite them.

## Module structure

### New files
- `src/tools/issue-files.ts` — shared helpers

### Modified files
- `src/tools/issues.ts` — three new tools added to the `tools` array
- `package.json` — `yaml` dependency added

### Unchanged
- `server.ts` — already picks up all tools from `issueTools` automatically
- `types.ts`, `gh.ts` — no changes needed

## New dependency

- `yaml` (`eemeli/yaml`) npm package for YAML parse/stringify in frontmatter handling

## Token savings

| Operation | Before (tokens) | After (tokens) |
|-----------|-----------------|----------------|
| Read issue body | Full body in context | File path only (~30 tokens) |
| Edit issue body | Full body as param | `Edit` tool diff (~50-200 tokens) |
| Write back | Full body as param | File path only (~30 tokens) |

For a 2000-token issue body, this saves ~5500+ tokens per edit cycle.

## Out of scope

- PR pull/push (can follow same pattern later)
- Comment pull/push
- Conflict detection beyond the `remote_newer` flag
- Output directory cleanup/garbage collection
