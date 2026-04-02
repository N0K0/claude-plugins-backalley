# Process Plugin — Design Spec

**Date:** 2026-04-02
**Issues:** #11 (development process skill), #120 (update references)
**Status:** Approved

## Overview

A new plugin (`plugins/process/`) providing four skills that orchestrate a GitHub Issues-driven development workflow. Each skill owns one phase of the lifecycle and manages label transitions on the issue.

GitHub Issues are the single source of truth — no local spec files, no local plan files, no `.tasks.json`. The issue body holds the spec and the implementation checklist.

## Plugin Structure

```
plugins/process/
├── .claude-plugin/plugin.json
├── skills/
│   ├── brainstorm/SKILL.md
│   ├── plan/SKILL.md
│   ├── execute/SKILL.md
│   └── review/SKILL.md
├── README.md
└── LICENSE
```

## Dependencies

- **Hard dependency on gh plugin.** Each skill checks for `detect_repo` tool availability on entry. If missing, error with install instructions. No local file fallback.

## Label State Machine

Labels managed by the plugin:

| Label | Meaning |
|-------|---------|
| `needs-spec` | Issue needs specification work |
| `has-spec` | Spec is written in the issue body |
| `in-progress` | Actively being implemented |
| `backlog` | Not yet started |

Transitions:

```
backlog + needs-spec  →  brainstorm  →  backlog + has-spec
backlog + has-spec    →  plan        →  in-progress
in-progress           →  execute     →  in-progress (checklist items ticked)
in-progress (all done)→  review      →  closed (via PR merge + Closes #N)
```

## Skill Triggers

| Skill | Triggers when user says... | Required issue state |
|-------|---------------------------|---------------------|
| brainstorm | "brainstorm issue 11", "spec out issue 11" | `needs-spec` label |
| plan | "plan issue 11", "break down issue 11" | `has-spec` label, no checklist in body |
| execute | "work on issue 11", "implement issue 11" | `in-progress` label, unchecked items |
| review | "review issue 11", "PR for issue 11" | `in-progress` label, all items checked |

Each skill validates the issue is in the expected state. If wrong state, it tells the user which skill to run instead.

## Skill: brainstorm

**Label transition:** remove `needs-spec`, add `has-spec`

**Flow:**
1. `detect_repo` — set repo context (guard: error if gh plugin missing)
2. `issue_pull` — read current issue body
3. Validate `needs-spec` label present
4. Ask clarifying questions one at a time (multiple choice preferred)
5. Propose 2-3 approaches with recommendation
6. Present design sections, get user approval after each
7. Write approved spec into the issue body via `issue_push`
8. `issue_update` — remove `needs-spec`, add `has-spec`
9. Tell user to run plan next

**Patterns borrowed from superpowers brainstorming:** One question at a time, multiple choice preferred, propose approaches before committing, section-by-section approval, YAGNI ruthlessly.

**Not included:** Spec review subagent loop (issue body is shorter/more focused than a full design doc — user approval is sufficient), local spec file, visual companion.

## Skill: plan

**Label transition:** remove `backlog`, remove `has-spec`, add `in-progress`

**Flow:**
1. `issue_pull` — read the spec from issue body
2. Validate `has-spec` label, no existing checklist in body
3. Explore the codebase to understand what needs to change (files, patterns, dependencies)
4. Break the spec into a task checklist — ordered, concrete, file-level steps
5. Append checklist to issue body as GitHub-flavored markdown checkboxes
6. `issue_push` — write updated body
7. `issue_update` — remove `backlog`, remove `has-spec`, add `in-progress`
8. Tell user to run execute next

**Checklist format:**
```markdown
## Implementation Checklist
- [ ] Task 1: Create foo.ts with bar interface
- [ ] Task 2: Implement baz handler
- [ ] Task 3: Update README with new usage
```

**Native Claude Code tasks** are created via `TaskCreate` for session tracking, but the issue checklist is authoritative.

## Skill: execute

**No label transition** — stays `in-progress`, checklist items get ticked.

**Flow:**
1. `issue_pull` — parse checklist from issue body
2. Validate `in-progress` label, at least one unchecked item
3. Create native Claude Code tasks from unchecked items
4. Create a git worktree: `git worktree add` on branch `issue-{number}`
5. For each task in order:
   - Mark native task `in_progress`
   - Implement the work
   - Mark native task `completed`
   - Tick the checkbox in issue body, `issue_push` to sync
6. When all items checked, tell user to run review next

**Worktree naming:** Directory `worktree-issue-{number}`, branch `issue-{number}`.

**Sync cadence:** Push to GitHub after each checklist item completion. If session crashes mid-way, progress is preserved in the issue.

## Skill: review

**Label transition:** Issue closed automatically via `Closes #N` in PR.

**Flow:**
1. `issue_pull` — verify all checklist items are ticked
2. Validate `in-progress` label
3. Run project test commands, verify they pass
4. Create PR via `pr_create`:
   - Title: issue title
   - Body: `Closes #{number}` + summary
   - Head: `issue-{number}`
   - Base: `main`
5. Present options:
   - **Merge** — squash merge via `pr_merge`, issue closes automatically
   - **Keep PR open** — for external review, user merges later
6. If merged: clean up worktree (`git worktree remove`)

**Guard:** If tests fail, tell user to run execute again. Don't proceed to PR.

## Not In Scope

- Hook-based auto-sync of tasks to issue checklist (issue #119)
- Local file fallback when gh plugin unavailable
- Spec review subagent loops
- Visual companion during brainstorm

## Issue #120: Update References

The gh plugin README should document `issue_pull`, `issue_push`, `issue_diff` tools. Verify current state during implementation — recent commits may have already added this documentation.
