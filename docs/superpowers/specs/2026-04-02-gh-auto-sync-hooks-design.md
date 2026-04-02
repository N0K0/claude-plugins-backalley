# Spec: Auto-sync hooks for GitHub issue files

**Issue:** #119
**Date:** 2026-04-02
**Status:** Draft

## Problem

The gh plugin's `issue_pull`, `issue_push`, and `issue_diff` tools require manual invocation. Users must remember to pull fresh copies and push changes. Hooks can automate this.

## Requirements

1. **SessionStart auto-pull**: Refresh issues that already have local files in `.issues/`
2. **Stop auto-push**: Push modified issue files after each Claude turn, with conflict detection (skip-and-warn)
3. **New issue creation**: Files matching `issue-new*.md` without a `number` create new GitHub issues on push, then get renamed to `issue-{number}.md`
4. **Fixed directory**: `.issues/` in project root (no configuration file)
5. **Conflict handling**: If remote changed since last pull, skip the file and warn — never overwrite silently in either direction

## Approach

**Approach 2: Hooks invoke Bun scripts from the plugin.**

Hook bash wrappers delegate to TypeScript scripts that reuse the existing gh plugin code (YAML parsing, `gh api` wrappers, serialization, diff). This avoids duplicating logic in bash while keeping hooks independent of the MCP server lifecycle.

Bun is already a hard requirement for the gh plugin.

## Architecture

### File layout

```
plugins/gh/
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       ├── session-start-pull.sh
│       └── stop-push.sh
├── src/
│   ├── hooks/
│   │   ├── pull-existing.ts
│   │   ├── push-changed.ts
│   │   └── shared.ts
│   └── tools/
│       └── issues.ts              # Modified: issue_push gains create-from-file
```

### hooks.json

Registers two Claude Code hook events:

- `SessionStart` → `session-start-pull.sh` (timeout: 30s)
- `Stop` → `stop-push.sh` (timeout: 30s)

No pre-commit hook — Claude Code doesn't have a PreCommit event. Users can wire the Bun scripts into a git pre-commit hook manually if desired.

### Bash wrappers

Each is ~5 lines: read JSON from stdin, invoke `bun run ${CLAUDE_PLUGIN_ROOT}/src/hooks/<script>.ts`, forward stdout. Follows the terminal-color-status pattern.

## Component designs

### SessionStart — pull existing issues

1. Find project root (walk up from cwd looking for `.git`)
2. Check `.issues/` exists — if not, exit silently with `{}`
3. Detect GitHub remote via `gh repo view`
4. List all `issue-*.md` files, extract issue numbers from filenames
5. For each issue number, fetch current state via `gh api /repos/{owner}/{repo}/issues/{number}`
6. Overwrite local files with fresh content using `serializeIssue()`
7. Output: `{ "status": "ok", "summary": "Pulled 5 issues." }`

Edge cases:
- No `.issues/` directory → skip silently
- Not a git repo / no GitHub remote → skip silently
- Issue deleted/transferred on GitHub → log warning, leave local file
- Network failure → log warning, continue with remaining issues

### Stop — push modified issues

1. Find project root, check `.issues/` exists — if not, exit silently
2. List all `issue-*.md` and `issue-new*.md` files
3. For existing issues (files with a number):
   - Read `pulled_at` from frontmatter
   - Compare file mtime against `pulled_at` — skip unmodified files
   - Fetch remote state via `gh api`
   - **Conflict check**: if remote `updated_at` > local `pulled_at`, skip and warn
   - **No conflict**: PATCH the issue, update `pulled_at` to now
4. For new issues (files matching `issue-new*.md`):
   - Validate `title` exists — skip with error if missing
   - POST to create issue
   - Update frontmatter with `number`, `url`, `pulled_at`
   - Rename file to `issue-{number}.md`
5. Output: `{ "status": "ok", "summary": "Pushed 2, created 1. Skipped #42 (remote newer).", "warnings": [...] }`

### New issue file format

Files matching `issue-new*.md` (e.g., `issue-new.md`, `issue-new-auth-refactor.md`) use standard frontmatter without `number`, `url`, or `pulled_at`:

```yaml
---
title: "Add auth refactor tracking"
state: open
labels:
  - enhancement
milestone: 2
assignees:
  - N0K0
---

Body content here...
```

On creation, the file gains `number`, `url`, `pulled_at` and is renamed to `issue-{number}.md`.

### Integration with issue_push MCP tool

The existing `issue_push` tool also gains create-from-file logic. When it encounters `issue-new*.md` files in a directory push, it creates them the same way. This means both auto-sync and manual push handle new issues identically.

## Code reuse

The Bun hook scripts import directly from existing modules:

| Module | Reused exports |
|---|---|
| `src/tools/issue-files.ts` | `serializeIssue()`, `parseIssueFile()` |
| `src/gh.ts` | `api()`, `detectRepo()` |
| `src/types.ts` | `slim()` |

New shared module `src/hooks/shared.ts` provides:

- `findProjectRoot(cwd)` — walk up to `.git`
- `findIssueFiles(dir)` — glob `issue-*.md` and `issue-new*.md`
- `isModifiedSince(filePath, pulledAt)` — compare file mtime against `pulled_at`

No new dependencies.

## Error handling

| Scenario | Behavior |
|---|---|
| No `.issues/` dir | Exit silently, output `{}` |
| Not a git repo / no GitHub remote | Exit silently, output `{}` |
| `gh` CLI not installed or not authed | Exit with error JSON |
| Network timeout on one issue | Log warning, continue with rest |
| Conflict (remote newer) | Skip file, add to warnings |
| New issue creation fails | Log error, leave file as-is |
| YAML parse error in a file | Skip file, add to warnings |
| Hook timeout (30s) | Harness kills process — partial work is fine |

**Principle:** Auto-sync never blocks the session or fails loudly. All errors become warnings. Manual MCP tools are always available as fallback.

## Hook output contract

```json
{
  "status": "ok",
  "summary": "Pulled 3 issues, pushed 2, created 1. Skipped #42 (remote newer).",
  "warnings": ["Issue #42: remote has changes since last pull. Run issue_diff to inspect."]
}
```

Claude Code surfaces `summary` and `warnings` to the user.
