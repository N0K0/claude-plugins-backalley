# gh

MCP server for the GitHub CLI with a local-file workflow for issues. Pull issues to `.issues/` as markdown, edit them with frontmatter, and push back to GitHub — comments and all. Also exposes labels, milestones, projects, and pull requests as MCP tools.

## Install
```
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install gh@claude-plugins-backalley
```

## Components

### Skills

- **create-issue** — write a new issue as a local markdown file with frontmatter; auto-synced to GitHub on Stop hook or manual push.
  Example: ask "create an issue titled 'Fix login redirect' with the bug label" — Claude writes `.issues/issue-new-login.md` and the Stop hook pushes it, renaming to `issue-{number}-fix-login-redirect.md`.

### Hooks

- **SessionStart** — runs `session-start-pull.sh` to refresh any issue files already present in `.issues/`, so local files start the session up to date.
- **Stop** — runs `stop-push.sh` to push modified issue files (and create new ones from `issue-new*.md`) when the session ends.

### MCP servers

The plugin ships one MCP server (`gh`) wrapping the `gh` CLI. Tools are grouped by purpose; one example per group below.

- **Repo detection** — `detect_repo` sets the default owner/repo from a local git path so other tools don't need explicit repo args.
  Example tool call: `detect_repo({ path: "/home/me/git/myproject" })`.
- **Issue local-file sync** — `issue_pull`, `issue_push`, `issue_diff` move issues between GitHub and `.issues/*.md` files with comment sync and conflict detection. Files are named `issue-{number}-{title-slug}.md`; legacy `issue-{N}.md` files are migrated on next pull. Closed issues are stored in `.issues/closed/` and moved back to the top level if reopened.
  Example: `issue_pull({ path: ".issues", state: "open" })` writes every open issue as a markdown file.
  Folder-mode sync is incremental: `issue_pull` skips issues whose local `pulled_at` is at or after the remote `updated_at`, and `issue_push` skips files whose mtime is at or before their `pulled_at`. Pass `force: true` to bypass these checks. Single-file pushes (`issue_push({ path: ".issues/issue-42.md" })`) always run regardless of mtime.
- **Issue CRUD & search** — `issue_create`, `issue_update`, `issue_get`, `issue_list`, `issue_search`, `issue_comment` for direct API access without the local file dance.
  Example: `issue_search({ body_contains: "OOM", labels: "bug" })`.
- **Labels** — `label_create`, `label_list`, `label_delete`.
  Example: `label_create({ name: "needs-spec", color: "fbca04" })`.
- **Milestones** — `milestone_create`, `milestone_list`, `milestone_update`.
  Example: `milestone_list({ state: "open" })`.
- **Projects (V2)** — `project_list`, `project_items`, `project_move`, `project_add`.
  Example: `project_add({ project_id: 3, content_id: "I_kw..." })`.
- **Pull requests** — `pr_create`, `pr_list`, `pr_get`, `pr_merge`, `pr_review_request`.
  Example: `pr_create({ title: "Fix login", base: "main", head: "fix-login" })`.

## Requirements

- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)
- [Bun](https://bun.sh/) runtime (used to run the MCP server)
- Network access to api.github.com

## License

[LICENSE](LICENSE)
