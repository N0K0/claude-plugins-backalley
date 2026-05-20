# Built-in Plan Sync

Shared operational reference for `process:*` skills that work through an issue checklist. The skill bodies of `execute-issue` and `finish-issue` link to this file rather than restating the rules.

The **markdown checklist** in `.issues/issue-{N}.md` (under `## Implementation Checklist`) is the source of truth for issue progress. The **built-in plan** — the native task list maintained via `TaskCreate` / `TaskUpdate` / `TaskList` — mirrors that checklist so the user sees live progress in the Claude Code UI.

## Owning skills

These skills must follow the rules below:

- `process:execute-issue` — creates native tasks; ticks checkboxes; updates tasks on each transition.
- `process:finish-issue` — closes out remaining tasks before opening the PR.

## Exempt skills

These skills do not modify issue checklists or own task progress, and are exempt:

- `process:spec-issue`
- `process:plan-issue`
- `process:lint-issues`
- `process:request-review`
- `process:receiving-review`

Exempt skills should not call `TaskCreate` / `TaskUpdate` against issue checklist items.

## Rules

### Initial population (execute-issue)

When `execute-issue` begins work on an issue:

1. Parse the `## Implementation Checklist` for `- [ ]` items.
2. Apply the **nested-flatten rule** (see below) to derive the task list.
3. Call `TaskCreate` once per derived item, in source order. The `subject` argument is `#{N}: {item text}`, where `N` is the issue number and `{item text}` is the normalized item text (see normalization rule).
4. Write `.issues/issue-{N}.tasks.json` with the resulting native IDs. The `subject` field in `tasks.json` stores the **raw item text without the `#{N}: ` prefix** — the prefix is added at `TaskCreate` time only.

If the issue body contains zero `- [ ]` items, **do not** call `TaskCreate` at all. Emit a plain text message: `"Issue #{N} has no checklist — run process:plan-issue first."`

### Per-item lifecycle (execute-issue)

For each unchecked checklist item, in order:

1. Call `TaskUpdate` with `status: "in_progress"` for the corresponding native task.
2. Do the implementation work (TDD, commits, etc.).
3. When the item is complete:
   1. Call `TaskUpdate` with `status: "completed"` for the task. **TaskUpdate runs first** — before the markdown edit.
   2. Edit the markdown to tick `- [ ]` → `- [x]` for the item, in the same model response.
   3. Update `.issues/issue-{N}.tasks.json` (`status: "completed"` for this index, refresh `lastUpdated`).
   4. Call `issue_push` to sync the checklist to GitHub.

If the `TaskUpdate` call in step 3.1 fails, retry exactly once. If the retry also fails, **stop the workflow and surface the error to the user**. Do not tick the markdown checkbox. Do not proceed to the next item.

### Reconciliation on resume (execute-issue)

When `execute-issue` resumes a partially-finished issue:

1. Call `TaskList` to inspect the current native task list.
2. For each existing task whose subject starts with `#{N}: `, strip the prefix and trim whitespace — this yields the **comparison key**.
3. For each `- [ ]` / `- [x]` item in the current checklist, derive its comparison key by trimming whitespace (no prefix to strip).
4. Match by exact, case-sensitive string equality. No fuzzy matching.
5. For each match:
   - If the checklist item is `- [x]` and the task is not `completed`, mark the task `completed`.
   - Otherwise, leave the task alone.
6. For each checklist item with no matching task, call `TaskCreate` to add it (same prefix rule as initial population). Append to the end of the native task list.
7. For each existing `#{N}: …` task with no matching checklist item, call `TaskUpdate` with `status: "cancelled"`. Do not delete it.

Reordering checklist items is a no-op — matching is by text, not position.

### Closeout (finish-issue)

When `finish-issue` runs, before any PR creation work:

1. Call `TaskList`.
2. For every task whose subject starts with `#{N}: ` and whose status is `pending` or `in_progress`, call `TaskUpdate` with `status: "completed"`. The issue checklist is the final authority — if every checklist item is `- [x]`, the corresponding tasks must end the run as `completed`.
3. Tasks with `status: "cancelled"` are left as-is — they are intentional orphans and do not count against the "no remaining tasks" precondition.
4. Update `.issues/issue-{N}.tasks.json` accordingly.

## Nested-flatten rule

The Markdown checklist may have nested items:

```markdown
- [ ] Top-level item
  - [ ] Level-2 child A
  - [ ] Level-2 child B
    - [ ] Level-3 child (dropped)
- [ ] Another top-level item
```

Flatten to at most two levels when deriving native tasks:

- Top-level items (`- [ ]` at zero indentation under `## Implementation Checklist`) become tasks with subject `{item text}`.
- Level-2 items become tasks with subject `{parent text} > {child text}`.
- Level-3 and deeper items are **dropped** — they are not created as native tasks. Their completion is considered implicit when the level-2 parent is marked complete.

The `#{N}: ` prefix is then prepended at `TaskCreate` time.

## Normalization rule

For reconciliation matching:

- Strip the `#{N}: ` prefix from the existing task subject.
- Trim leading and trailing whitespace from both sides being compared.
- Compare with case-sensitive exact string equality.

No fuzzy matching, no punctuation normalization, no Unicode folding.

## tasks.json schema

`.issues/issue-{N}.tasks.json` co-located with the issue file:

```json
{
  "issueNumber": 144,
  "specPath": ".issues/issue-144-….md",
  "tasks": [
    {
      "index": 0,
      "subject": "Task 1: Create _shared/builtin-plan-sync.md reference",
      "status": "pending",
      "nativeId": "1"
    }
  ],
  "lastUpdated": "2026-05-20T18:25:00.000Z"
}
```

- `index` is 0-based, matches checklist order, and is the stable cross-session key.
- `subject` is the raw checklist item text **without** the `#{N}: ` prefix.
- `status` mirrors the native task status: `pending`, `in_progress`, `completed`, or `cancelled`.
- `nativeId` is session-scoped — refresh on every `TaskCreate` call during resume.

## What this rule is not

- Not a guarantee against drift caused by hand-edits outside the owning skills.
- Not a substitute for the markdown checklist as the source of truth. If the two disagree, the markdown wins.
- Not automated by a hook — `process:*` skills implement this in their bodies. A future hook (tracked separately) may enforce it.
