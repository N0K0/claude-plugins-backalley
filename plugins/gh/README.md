# gh MCP Plugin

MCP server wrapping the `gh` CLI for use with Claude Code. Exposes 24 tools across Issues, Labels, Milestones, Projects (V2), and Pull Requests.

## Prerequisites

- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [Bun](https://bun.sh/) runtime

## Repo Scoping

On startup the server detects the current Git repository and uses it as the default for all tools. Every tool accepts optional `owner` and `repo` parameters to override this for cross-repo operations.

## Tools

### Issues (9)

| Tool | Description |
|------|-------------|
| `issue_create` | Create a new issue |
| `issue_update` | Update an existing issue (title, body, state, assignees, labels, milestone) |
| `issue_get` | Get details for a single issue by number |
| `issue_list` | List issues with optional filters (state, labels, assignee, milestone) |
| `issue_search` | Search issues using GitHub search syntax |
| `issue_comment` | Add a comment to an issue |
| `issue_pull` | Pull issues to local markdown files with YAML frontmatter for token-efficient editing |
| `issue_push` | Push local markdown issue file(s) back to GitHub (file or directory) |
| `issue_diff` | Compare local issue file(s) against GitHub, showing unified diff of changes |

### Labels (3)

| Tool | Description |
|------|-------------|
| `label_create` | Create a new label with name, color, and optional description |
| `label_list` | List all labels in a repository |
| `label_delete` | Delete a label by name |

### Milestones (3)

| Tool | Description |
|------|-------------|
| `milestone_create` | Create a new milestone with title, description, and optional due date |
| `milestone_list` | List milestones with optional state filter |
| `milestone_update` | Update an existing milestone (title, description, state, due date) |

### Projects V2 (4)

| Tool | Description |
|------|-------------|
| `project_list` | List projects for a user or organization |
| `project_items` | List items in a project |
| `project_move` | Move a project item to a different status/column |
| `project_add` | Add an issue or PR to a project |

### Pull Requests (5)

| Tool | Description |
|------|-------------|
| `pr_create` | Create a pull request |
| `pr_list` | List pull requests with optional filters |
| `pr_get` | Get details for a single PR by number |
| `pr_merge` | Merge a pull request |
| `pr_review_request` | Request reviewers for a pull request |

## Local Issue Editing Workflow

Issues can be edited locally as Markdown files, then pushed back to GitHub. This enables bulk edits, offline review, and using Claude Code to reason over issue content.

### `.issues/` Directory Convention

When you pull issues (`issue_pull`), they are written to `.issues/` in the current working directory:

```
.issues/
  42.md          # existing issue — edit body/frontmatter, then push
  issue-new.md   # new issue to create — picked up on next push/Stop hook
```

Files are named `<number>.md` for existing issues. New issues use any filename matching `issue-new*.md` (e.g., `issue-new-auth-bug.md`, `issue-new2.md`).

Frontmatter fields: `title`, `number`, `state`, `labels`, `assignees`, `milestone`, `updated_at`.

### Creating New Issues

Create a file in `.issues/` with a name matching `issue-new*.md`:

```markdown
---
title: "Fix the thing"
labels: ["bug"]
---

Body text here.
```

On the next `issue_push` call (or when the session ends via the Stop hook), the file is created as a GitHub issue and renamed to `<number>.md`.

### Auto-Sync Hooks

The plugin installs two lifecycle hooks:

- **SessionStart** — automatically pulls all issues already present in `.issues/` so your local files stay current at the start of each session.
- **Stop** — automatically pushes any modified issue files and creates new issues from `issue-new*.md` files when the session ends.

### Conflict Handling

If GitHub has a newer `updated_at` timestamp than the local file, the push is skipped with a warning. Edit conflicts are never silently overwritten — you will be told which files were skipped so you can review and re-push manually.

## Error Handling

- Missing `gh` binary: returns a clear error pointing to installation instructions
- Auth failure: surfaces the `gh` auth error message directly
- API errors: passed through from the GitHub API with status codes intact
