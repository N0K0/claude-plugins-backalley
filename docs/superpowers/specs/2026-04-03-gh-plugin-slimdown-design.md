# gh Plugin Slimdown: Issue-Centric MCP Server

## Problem

The gh plugin exposes 26 MCP tools covering issues, PRs, labels, milestones, and projects. Most of these duplicate what the `gh` CLI already does. The only tools that add real value are `issue_pull`, `issue_push`, and `issue_diff` — they enable token-efficient local editing of issues as markdown files.

## Decision

Strip the MCP server down to 5 tools focused on local issue management. Drop all PR, label, milestone, and project tools — the `gh` CLI handles those directly. Add comment sync to the pull/push workflow, and replace the GitHub-API-based `issue_search` with a local frontmatter search.

## Tool Inventory

| Tool | File | Purpose |
|------|------|---------|
| `detect_repo` | `tools/repo.ts` | Set repo context for subsequent calls |
| `issue_pull` | `tools/issue-sync.ts` | Fetch issues from GitHub to local `.issues/` markdown (includes comments) |
| `issue_push` | `tools/issue-sync.ts` | Push local changes back to GitHub (body, metadata, new/edited comments) |
| `issue_diff` | `tools/issue-sync.ts` | Compare local vs remote state |
| `issue_search` | `tools/issue-search.ts` | Search local `.issues/` files by frontmatter fields |

### Deleted

All tools in: `tools/issues.ts` (standalone CRUD), `tools/prs.ts`, `tools/labels.ts`, `tools/milestones.ts`, `tools/projects.ts`.

### Kept As-Is

`server.ts` (updated imports), `state.ts`.

### Modified

- `issue-files.ts` — extended for comment serialization/parsing.
- `gh.ts` — remove unused `graphql()` function (no remaining tools use it).

### Cleanup

- Remove `paginationParams` from `types.ts` (no remaining paginated API tools).
- Delete test files for removed tools; update `issue-files.test.ts`, `pull-existing.test.ts`, `push-changed.test.ts` for comment handling.
- Update `plugins/gh/skills/create-issue/SKILL.md` example frontmatter if the file format changes affect it.

## Issue File Format

```markdown
---
number: 42
title: Fix the login bug
state: open
labels: [bug]
milestone: 3
assignees: [alice]
url: https://github.com/N0K0/claude-plugins-backalley/issues/42
pulled_at: "2026-04-03T12:00:00Z"
---

Issue body here...

## Comments

### @alice — 2026-03-28T10:18:06Z <!-- id:12345 -->

First comment text...

### @bob — 2026-03-29T14:22:00Z <!-- id:12346 -->

Reply text...

### @N0K0 — new

A new comment to be created on push.
```

### Comment Format Rules

- `## Comments` section is always last, separated from body by a blank line.
- Each comment heading: `### @author — timestamp <!-- id:NNNNN -->`.
- The timestamp is the comment's `created_at` from the GitHub API. `updated_at` is not tracked in the heading.
- New comments use `### @author — new` (no id, no timestamp). Push creates them and rewrites the heading with the real id and timestamp.
- If there are no comments, the `## Comments` section is omitted.

### Parsing Contract

`parseIssueFile` returns an updated type:

```typescript
interface Comment {
  id?: number;       // GitHub comment ID — absent for new comments
  author: string;    // GitHub username
  timestamp?: string; // ISO 8601 created_at — absent for new comments
  body: string;      // Comment body markdown
}

interface ParsedIssueFile {
  frontmatter: IssueFrontmatter;
  body: string;       // Issue body, excluding ## Comments section
  comments: Comment[];
}
```

The body/comments split is done by finding the **last** `## Comments` line that is preceded by a blank line. Everything before it is the body; everything after is parsed into `Comment[]`. Known limitation: if an issue body contains a literal `## Comments` line preceded by a blank line, the parser will incorrectly split there. This is acceptable for developer tooling — avoid using that exact heading in issue bodies.

### Comment Edit Failure Handling

When pushing an edited comment that the authenticated user does not own, the PATCH will return a 403. This is added to the existing `skipped` array in the push result (e.g., `"comment 12345 by @bob: permission denied"`). The local edit is left as-is. The user can then decide whether to revert or post a new comment instead.

## Pull Logic

1. Fetch issue metadata and body (existing behavior).
2. Fetch all comments via `GET /repos/{owner}/{repo}/issues/{number}/comments` (paginated, 100 per page).
3. Serialize into `## Comments` section with `### @author — timestamp <!-- id:NNNNN -->` headings.
4. Write the full file: frontmatter + body + comments.

The auto-sync hook (session start) re-pulls comments along with the issue.

## Push Logic

1. Parse the `## Comments` section into a list of `{id, author, timestamp, body}` entries.
2. Fetch current comments from GitHub API for comparison.
3. For each local comment:
   - **Has id, body unchanged** — skip.
   - **Has id, body changed** — PATCH via API (fails gracefully if not the authenticated user's comment).
   - **No id (new)** — POST to create, rewrite heading with returned id and timestamp.
4. Comments on GitHub but not in local file — left alone. No deletion via push.
5. Rewrite local file with updated ids, timestamps, and `pulled_at`.

## Diff Logic

`issue_diff` compares local comment list against remote:

- New local comments (pending push).
- Edited comments (body differs from remote).
- New remote comments (not yet pulled).
- Unified diff format for comment body changes.

## Hooks

Both existing hooks must be updated for comment-aware serialization/parsing.

### Session-start hook (`pull-existing.ts`)

- Currently: fetches each `issue-{N}.md` file's metadata + body from GitHub, rewrites locally.
- After: also fetches comments and writes the `## Comments` section. Uses the same serialization as `issue_pull`.

### Stop hook (`push-changed.ts`)

- Currently: for modified issues, PATCHes metadata + body to GitHub.
- After: also handles comment sync (new and edited comments), using the same logic as `issue_push`.
- **New comments are pushed** — if a user ends a session with unpushed new comments, the hook posts them. This matches the existing behavior where body edits are auto-pushed on session end.
- Conflict detection: existing issue-level `pulled_at` check applies. No per-comment conflict detection — if a comment was edited both locally and remotely since last pull, the local version wins on push. The next pull will re-fetch the pushed version, so no data is permanently lost.

## Local Issue Search

`issue_search` reads `.issues/*.md` files and filters by frontmatter fields. It does **not** go through `resolveRepo()` — it is purely local and bypasses repo resolution in `server.ts` (same pattern as `detect_repo`).

### Parameters

- `path` — absolute path to the issues directory. No default — caller must provide the path (typically from a prior `detect_repo` or known project root).
- `state` — `open`, `closed`, or `all` (default: `open`).
- `labels` — comma-separated list, matches issues that have all specified labels.
- `milestone` — milestone number or `none`.
- `assignee` — username or `none`.

### Output

List of matching issues with frontmatter fields only (number, title, state, labels, milestone, assignees, url). No body content.

No indexing or caching — brute-force read and filter is sufficient for typical `.issues/` folder sizes.

### Intentionally Dropped Search Capabilities

The old `issue_search` queried GitHub's Search API, which supported full-text body search, date ranges, comment count filters, and other advanced operators. These are intentionally dropped. For advanced queries, use `gh search issues` or `gh issue list` directly.

## Existing Functionality Preserved

- Milestone field stays in frontmatter — pull/push syncs it. Milestone CRUD is done via `gh` CLI.
- New issue creation via `issue-new*.md` files — same naming convention and push behavior.
- Crash safety on new issues — number written to file before rename.
- Conflict detection via `pulled_at` timestamp.
