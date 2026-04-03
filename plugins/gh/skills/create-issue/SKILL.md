---
name: create-issue
description: Create a new GitHub issue by writing a local markdown file with YAML frontmatter. The file is auto-synced to GitHub.
---

# Create Issue from File

Write a markdown file in `.issues/` to create a new GitHub issue. The file will be pushed to GitHub automatically on the next Stop hook, or manually via `issue_push`.

## File naming

Use `issue-new*.md` — for example:
- `issue-new.md`
- `issue-new-auth-bug.md`
- `issue-new-refactor-api.md`

## Frontmatter format

```yaml
---
title: "Issue title here"
state: open
labels:
  - bug
  - priority-high
milestone: 3
assignees:
  - username
---

Issue body in markdown.
```

Only `title` is required. All other fields are optional.

## What happens on push

1. The issue is created on GitHub via the API
2. The file's frontmatter is updated with the assigned `number`, `url`, and `pulled_at`
3. The file is renamed from `issue-new*.md` to `issue-{number}.md`

## Notes

- The `.issues/` directory must exist (create it with `issue_pull` first, or `mkdir .issues`)
- Auto-push happens on the Stop hook (after each Claude turn)
- You can also push manually: call `issue_push` with the `.issues/` directory path

## Adding comments to new issues

You can add comments to a new issue file before pushing. Append a `## Comments` section after the body:

```markdown
---
title: "New issue"
state: open
labels: []
---

Issue body here.

## Comments

### @username — new

First comment on the new issue.
```

Comments with `— new` headings will be posted as comments on the issue after it is created.
