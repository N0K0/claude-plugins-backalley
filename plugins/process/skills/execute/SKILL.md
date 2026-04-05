---
name: execute
description: "Implements an issue's checklist by creating a worktree, working through tasks, ticking checkboxes, and syncing to GitHub. Triggers on: 'work on issue N', 'implement issue N', 'execute issue N'."
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

Proceed only after all six checks pass.

## Execution Mode

After parsing the checklist, present the execution mode choice:

```
How should I execute this checklist?

1. Direct execution (I work through each item myself)
2. Subagent-driven (fresh subagent per task, with two-stage review)

Option 2 is recommended for checklists with 3+ items — it produces higher quality
through isolated context and structured review between tasks.
```

**If the user doesn't have a preference or says "just go":** default to direct execution for small checklists (1-2 items) and subagent-driven for larger ones.

## The Process

1. Parse the checklist: identify unchecked (`- [ ]`) items as remaining work. Note which items are already checked (`- [x]`) — those are done.

2. Create native Claude Code tasks via `TaskCreate` for each unchecked item. These provide session-level progress tracking.

3. Set up the worktree:
   - Run `git worktree list` to check if a worktree already exists at `../worktree-issue-{number}`.
   - If it exists: use it, change to that directory.
   - If it doesn't exist: check if branch `issue-{number}` already exists (`git branch --list issue-{number}`).
     - If the branch exists: `git worktree add ../worktree-issue-{number} issue-{number}`
     - If it doesn't exist: `git worktree add ../worktree-issue-{number} -b issue-{number}`

4. For each unchecked item, execute using the chosen mode (see Direct Execution or Subagent-Driven Execution below).

5. After all items are checked, run the **Final Quality Review** (see below).

6. When all items are checked and the quality review passes, tell the user: "All tasks complete for issue #N. Run `review` to create a PR."

## Direct Execution

For each unchecked item in order:

1. Mark the corresponding native task as `in_progress`.
2. Follow `process:tdd` — write failing test first, then implement.
3. Commit the changes with a descriptive message referencing the checklist item.
4. Mark the native task as `completed`.
5. In the local issue file, change `- [ ]` to `- [x]` for this item.
6. Call `issue_push` to sync the updated checklist to GitHub.

## Subagent-Driven Execution

Fresh subagent per task + two-stage review (spec compliance then code quality). This prevents context pollution between tasks and catches issues early.

For each unchecked item in order:

### Step 1: Dispatch Implementer

Mark the native task as `in_progress`, then dispatch a subagent using the template in `implementer-prompt.md`. Provide:
- Full text of the checklist item
- Context about the issue and what's already implemented
- The worktree directory to work in

### Step 2: Handle Implementer Status

The implementer reports one of four statuses:

**DONE:** Proceed to spec compliance review.

**DONE_WITH_CONCERNS:** Read the concerns. If about correctness or scope, address before review. If observational (e.g., "file is getting large"), note and proceed to review.

**NEEDS_CONTEXT:** Provide the missing information and re-dispatch.

**BLOCKED:** Assess the blocker:
1. If context problem: provide more context and re-dispatch
2. If task is too complex: break into smaller pieces
3. If the plan itself is wrong: escalate to the user

Never force the same subagent to retry without changes.

### Step 3: Spec Compliance Review

Dispatch a spec compliance reviewer using `spec-reviewer-prompt.md`. This verifies the implementer built what was requested — nothing more, nothing less.

- If issues found: have the implementer fix them, then re-review (max 3 iterations)
- If compliant: proceed to code quality review

### Step 4: Code Quality Review

**Only after spec compliance passes.** Dispatch a code quality reviewer using `code-quality-reviewer-prompt.md`.

- If issues found: have the implementer fix them, then re-review (max 3 iterations)
- If approved: mark task complete

### Step 5: Complete Item

1. Mark the native task as `completed`.
2. In the local issue file, change `- [ ]` to `- [x]` for this item.
3. Call `issue_push` to sync to GitHub.

Then proceed to the next unchecked item.

## Final Quality Review

After all checklist items are checked, before telling the user to run review:

1. **Run tests.** Look for test scripts in `package.json` (`scripts.test`), a `Makefile` (`make test`), or other common test runners. If tests fail, fix them and commit. Use `process:verify` — run the command, read the output, then claim the result.

2. **Run linter** if one exists (check `package.json` for a `lint` script, `Makefile` for a `lint` target, or common config files like `.eslintrc`, `ruff.toml`, `biome.json`). Fix any issues and commit.

3. **Dispatch a final code-review subagent** (using the `process:code-reviewer` agent) to review the full diff between the `issue-{number}` branch and `main`. This catches cross-task issues that per-task reviews miss: duplicated logic across tasks, inconsistent patterns, missing integration tests.

4. If the subagent returns findings: fix each issue, commit the fixes, and re-run (max 3 iterations).

5. After the review passes, sync the final checklist state via `issue_push`.

## Worktree Conventions

- **Directory:** `../worktree-issue-{number}` — a sibling to the main repo checkout
- **Branch:** `issue-{number}`
- Always work in the worktree directory, never on main/master
- **Never run `git checkout` or `git switch` in the main worktree.** Multiple Claude Code sessions share the same checkout — switching branches in the main worktree will break every other running session. All branch operations (checkout, merge, rebase) must happen inside an isolated worktree.
- The worktree is cleaned up by the review skill after merge

The sibling layout keeps the worktree easy to find and avoids nested worktrees. Example: if the repo lives at `~/git/my-project`, the worktree is at `~/git/worktree-issue-42`.

## Multi-Worktree (Optional Optimization)

For checklists with independent tasks that touch non-overlapping files, you can offer parallel execution using multiple worktrees. This is an optimization — default to single-worktree sequential execution unless the user opts in.

**When to offer:** After parsing the checklist in step 1, analyze the tasks for file-path independence. Two tasks are independent if they modify entirely different sets of files (no shared file paths). If 2 or more consecutive tasks are independent, offer multi-worktree to the user: "Tasks N and M appear independent (no overlapping files). I can work them in parallel using separate worktrees. Want to try that?"

**How it works:**
1. For each independent task, create a temporary worktree:
   - Branch: `issue-{number}-task-{N}` (temporary)
   - Directory: `../worktree-issue-{number}-task-{N}`
   - Base: branch off `issue-{number}` (the main feature branch)
2. Complete the task in its temporary worktree. Commit changes.
3. When the task is done, merge the temporary branch back into `issue-{number}`:
   - `cd ../worktree-issue-{number}` (main worktree)
   - `git merge issue-{number}-task-{N}`
   - `git worktree remove ../worktree-issue-{number}-task-{N}`
   - `git branch -d issue-{number}-task-{N}`
4. Tick the checkbox and sync via `issue_push` as normal.

**Conflict handling:** If merge conflicts occur, resolve them in the main worktree, commit, and continue. If conflicts are complex, fall back to sequential execution for remaining tasks.

**Do not use multi-worktree when:**
- Tasks have implicit ordering dependencies (later tasks use types/functions created by earlier tasks)
- The user hasn't opted in
- There are fewer than 2 independent tasks

## Resuming Interrupted Work

If a previous session was interrupted mid-checklist:

- The issue body on GitHub shows which items are already checked (`- [x]`). These are complete — skip them.
- Continue from the first unchecked item (`- [ ]`).
- The worktree and branch should already exist from the previous session. Run `git worktree list` to confirm, then resume from that directory.
- Re-create native tasks only for the remaining unchecked items — don't create tasks for already-completed work.

This is the crash-recovery model: GitHub is the persistent state. What's checked is done; what's unchecked is pending.

## Pitfalls

**Avoid:**
- Batching checklist syncs — call `issue_push` after each item so a crash doesn't lose progress
- Skipping spec compliance review before code quality review — reviewing code that doesn't match the spec is wasted effort
- Claiming tests pass without running them — use `process:verify`; "should pass" is not evidence
- Ticking items out of order — later tasks often assume earlier ones are complete; reorder only with explicit user approval
- Skipping checklist items, even if they seem redundant or simple
- Ignoring implementer escalations (BLOCKED/NEEDS_CONTEXT)

**Prefer:**
- Committing changes after each item before syncing
- Following TDD when implementing (use `process:tdd`)
- Running final quality review (tests, lint, subagent code review) before handing off to review
- Resuming from the first unchecked item when continuing interrupted work

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `issue_push`), git worktrees

**Uses skills:**
- `process:tdd` — Red-Green-Refactor cycle during implementation
- `process:verify` — Evidence before completion claims
- `process:debugging` — When tests fail or unexpected behavior occurs

**Uses agents:**
- `process:code-reviewer` — Final quality review and per-task code quality review

**Uses prompt templates (in this directory):**
- `implementer-prompt.md` — Subagent dispatch for implementation
- `spec-reviewer-prompt.md` — Subagent dispatch for spec compliance
- `code-quality-reviewer-prompt.md` — Subagent dispatch for code quality

**Previous skill:** `plan` (created the checklist in the issue body)

**Next skill:** `review` (creates PR and merges)

**No label transition** — issue stays `in-progress` while checklist items are ticked
