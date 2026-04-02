---
name: execute
description: "Use when implementing an issue that has a checklist — creates a worktree, works through tasks, ticks checkboxes, and syncs to GitHub. Triggers on: 'work on issue N', 'implement issue N', 'execute issue N'."
---

# Execute

**Announce at start:** "I'm using the execute skill to implement issue #N."

**Core principle:** Sync to GitHub after every completed checklist item. If the session crashes, progress is preserved.

## Entry Gate

Before doing any work, run these checks in order:

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."
2. Call `issue_pull` to fetch the issue to a local file.
3. Read the issue file and check its labels.
4. If the `in-progress` label is NOT present, stop with: "Issue #{N} doesn't have the `in-progress` label. [If needs-spec: Run brainstorm first. If has-spec: Run plan first.]"
5. Parse the issue body for checklist items (`- [ ]` and `- [x]`). If there are no checklist items, stop with: "Issue #{N} has no checklist. Run plan to create one."
6. If ALL items are already checked (`- [x]`), stop with: "All checklist items are complete. Run review to create a PR."

Do not proceed past the entry gate unless all six checks pass.

## The Process

1. Parse the checklist: identify unchecked (`- [ ]`) items as remaining work. Note which items are already checked (`- [x]`) — those are done.

2. Create native Claude Code tasks via `TaskCreate` for each unchecked item. These provide session-level progress tracking.

3. Set up the worktree:
   - Run `git worktree list` to check if a worktree already exists at `../worktree-issue-{number}`.
   - If it exists: use it, change to that directory.
   - If it doesn't exist: check if branch `issue-{number}` already exists (`git branch --list issue-{number}`).
     - If the branch exists: `git worktree add ../worktree-issue-{number} issue-{number}`
     - If it doesn't exist: `git worktree add ../worktree-issue-{number} -b issue-{number}`

4. For each unchecked item in order:
   - Mark the corresponding native task as `in_progress`.
   - Do the implementation work in the worktree.
   - Commit the changes with a descriptive message referencing the checklist item.
   - Mark the native task as `completed`.
   - In the local issue file, change `- [ ]` to `- [x]` for this item.
   - Call `issue_push` to sync the updated checklist to GitHub.

5. When all items are checked, tell the user: "All tasks complete for issue #N. Run `review` to create a PR."

## Worktree Conventions

- **Directory:** `../worktree-issue-{number}` — a sibling to the main repo checkout
- **Branch:** `issue-{number}`
- Always work in the worktree directory, never on main/master
- The worktree is cleaned up by the review skill after merge

The sibling layout keeps the worktree easy to find and avoids nested worktrees. Example: if the repo lives at `~/git/my-project`, the worktree is at `~/git/worktree-issue-42`.

## Resuming Interrupted Work

If a previous session was interrupted mid-checklist:

- The issue body on GitHub shows which items are already checked (`- [x]`). These are complete — skip them.
- Continue from the first unchecked item (`- [ ]`).
- The worktree and branch should already exist from the previous session. Run `git worktree list` to confirm, then resume from that directory.
- Re-create native tasks only for the remaining unchecked items — don't create tasks for already-completed work.

This is the crash-recovery model: GitHub is the persistent state. What's checked is done; what's unchecked is pending.

## Common Mistakes

**Problem:** Forgetting to sync after each item.
**Fix:** Call `issue_push` after ticking each checkbox. If you batch updates, a crash between items loses progress — GitHub won't reflect what was actually completed.

**Problem:** Working on the main branch.
**Fix:** Always use a worktree. The execute skill never works on main. If you find yourself in the main checkout, stop and set up the worktree before continuing.

**Problem:** Not creating a worktree.
**Fix:** Check `git worktree list` before starting implementation. If the worktree doesn't exist, create it. If it already exists from a prior session, reuse it.

**Problem:** Ticking items out of order.
**Fix:** Work through the checklist sequentially from top to bottom. Tasks may have implicit dependencies — later tasks often assume earlier ones are complete. Reordering without user approval risks building on a broken foundation.

## Red Flags

**Never:**
- Work on the main/master branch
- Batch sync checklist updates at the end of the session
- Skip checklist items (even if they seem redundant or simple)
- Reorder tasks without explicit user approval

**Always:**
- Use a worktree for all implementation work
- Sync to GitHub via `issue_push` after every completed item
- Work through the checklist sequentially
- Commit changes after each item before syncing
- Resume from the first unchecked item when continuing interrupted work

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `issue_push`), git worktrees

**Previous skill:** `plan` (created the checklist in the issue body)

**Next skill:** `review` (creates PR and merges)

**No label transition** — issue stays `in-progress` while checklist items are ticked
