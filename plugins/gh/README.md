# gh MCP Plugin

MCP server wrapping the `gh` CLI for use with Claude Code. Exposes 21 tools across Issues, Labels, Milestones, Projects (V2), and Pull Requests.

## Prerequisites

- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [Bun](https://bun.sh/) runtime

## Repo Scoping

On startup the server detects the current Git repository and uses it as the default for all tools. Every tool accepts optional `owner` and `repo` parameters to override this for cross-repo operations.

## Tools

### Issues (6)

| Tool | Description |
|------|-------------|
| `issue_create` | Create a new issue |
| `issue_update` | Update an existing issue (title, body, state, assignees, labels, milestone) |
| `issue_get` | Get details for a single issue by number |
| `issue_list` | List issues with optional filters (state, labels, assignee, milestone) |
| `issue_search` | Search issues using GitHub search syntax |
| `issue_comment` | Add a comment to an issue |

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

## Error Handling

- Missing `gh` binary: returns a clear error pointing to installation instructions
- Auth failure: surfaces the `gh` auth error message directly
- API errors: passed through from the GitHub API with status codes intact
