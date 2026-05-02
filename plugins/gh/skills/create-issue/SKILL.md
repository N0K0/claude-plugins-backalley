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
3. The file is renamed from `issue-new*.md` to `issue-{number}-{title-slug}.md`

## Notes

- The `.issues/` directory must exist (create it with `issue_pull` first, or `mkdir .issues`)
- Auto-push happens on the Stop hook (after each Claude turn)
- You can also push manually: call `issue_push` with the `.issues/` directory path

## Adding comments (new or existing issues)

Comments live in a `## Comments` section at the end of the file, with each comment under a `### @author — ...` heading. This works for both new issues and existing issue files pulled from GitHub.

**Format rules — these are the ONLY formats the parser accepts. Do not invent custom separators like `---comment-author---`; they will be silently treated as body text and pushed into the issue body on GitHub.**

```markdown
## Comments

### @alice — 2026-04-07T12:34:56Z <!-- id:12345 -->

Existing comment pulled from GitHub. The `<!-- id:N -->` marker is the comment's GitHub ID.

### @bob — new

A new comment to post. Use literal `— new` (em dash, the word "new") as the heading suffix and omit the id marker.
```

On `issue_push`:

- **New comments** (heading ends in `— new`, no id marker) are `POST`ed as fresh comments. After the push, the file is rewritten from server state so the id and timestamp are filled in automatically.
- **Existing comments** (have `<!-- id:N -->`) are compared against the remote body. If the local body differs, the comment is `PATCH`ed. Untouched comments are left alone.
- **Deleting** a comment locally does not delete it on GitHub — local deletion is ignored, and the next pull will reintroduce it.

To append a review or note to an existing issue file, just add another `### @author — new` block under the existing `## Comments` section (create the section if it doesn't exist). Do not try to edit the issue body to embed the comment inline.
