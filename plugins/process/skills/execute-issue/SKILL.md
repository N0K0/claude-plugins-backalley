---
name: execute-issue
description: "Implements an issue's checklist by creating a worktree, working through tasks, ticking checkboxes, and syncing to GitHub. Triggers on: 'work on issue N', 'implement issue N', 'execute issue N'."
---
# Execute Issue

**Announce at start:** "I'm using the execute-issue skill to implement issue #N."

**Core principle:** Sync to GitHub after every completed checklist item. If the session crashes, progress is preserved.

## Entry Gate

Before doing any work, run these checks in order:

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."
2. Call `issue_pull` with the `.issues/` directory path to sync all issues locally.
3. Read the issue file (`.issues/issue-{N}.md`) and check its labels.
4. If the `in-progress` label is NOT present, stop with: "Issue #{N} doesn't have the `in-progress` label. [If needs-spec: Run spec-issue first. If has-spec: Run plan-issue first.]"
5. Parse the issue body for checklist items (`- [ ]` and `- [x]`). If there are no checklist items, stop with: "Issue #{N} has no checklist. Run plan-issue to create one."
6. If ALL items are already checked (`- [x]`), stop with: "All checklist items are complete. Run finish-issue to create a PR."

Proceed only after all six checks pass.

7. Extract the plan working file: parse `.issues/issue-{N}.md` for the `## Implementation Checklist` section and write just that section (heading + all `- [ ]` / `- [x]` items) to `.issues/issue-{N}.plan.md`. Recreate this file fresh every time the skill is invoked — it is ephemeral and regenerable from the issue body at any time. The issue body is the source of truth.

7.5. **Check tasks.json for resume data.** Look for `.issues/issue-{N}.tasks.json`. If found:
   - Use the `subject` field from each entry to populate `TaskCreate` calls (step 2), rather than re-parsing the raw checklist text.
   - Skip entries whose `status` is `"completed"` — those are done.
   - After re-creating tasks with `TaskCreate`, write back to `.issues/issue-{N}.tasks.json` with the fresh `nativeId` values (previous session IDs are stale; replace them). Preserve `index`, `subject`, and `status`.

   If `.issues/issue-{N}.tasks.json` does not exist, proceed with normal checklist parsing (step 2), then write the file after all `TaskCreate` calls complete:
   ```json
   {
     "issueNumber": N,
     "specPath": ".issues/issue-{N}.md",
     "tasks": [
       { "index": 0, "subject": "...", "status": "pending", "nativeId": "<id>" }
     ],
     "lastUpdated": "<ISO timestamp>"
   }
   ```

## Execution Mode

After parsing the checklist, use `AskUserQuestion` to present the execution mode choice. Put the recommended option first with "(Recommended)" in its label:

- For checklists with 3+ items, recommend subagent-driven
- For 1-2 items, recommend direct execution

Options:
1. Direct execution — I work through each item myself
2. Subagent-driven — fresh subagent per task, with two-stage review

**If the user doesn't have a preference or says "just go":** default to direct execution for small checklists (1-2 items) and subagent-driven for larger ones.

## The Process

1. Parse the checklist: identify unchecked (`- [ ]`) items as remaining work. Note which items are already checked (`- [x]`) — those are done.

2. Create native Claude Code tasks via `TaskCreate` — **one task per checklist item, not per subtask**. Each checklist item is a phase; the implementer's internal steps (file edits, test runs, etc.) are not separate tasks. The only exception is when a subtask is something the harness can run as a script (e.g. a single Bash command that fully completes the work) — then it's fine to track that script invocation as its own task.

3. Set up the worktree:
   - Run `git worktree list` to check if a worktree already exists at `../worktree-issue-{number}`.
   - If it exists: use it, change to that directory.
   - If it doesn't exist: check if branch `issue-{number}` already exists (`git branch --list issue-{number}`).
     - If the branch exists: `git worktree add ../worktree-issue-{number} issue-{number}`
     - If it doesn't exist: `git worktree add ../worktree-issue-{number} -b issue-{number}`

4. For each unchecked item, execute using the chosen mode (see Direct Execution or Subagent-Driven Execution below).

5. After all items are checked, run the **Final Quality Review** (see below).

6. When all items are checked and the quality review passes, tell the user: "All tasks complete for issue #N. Run `finish-issue` to create a PR."

## Direct Execution

For each unchecked item in order:

1. Mark the corresponding native task as `in_progress`.
2. Follow `process:tdd` — write failing test first, then implement.
3. Commit the changes with a descriptive message referencing the checklist item.
4. Mark the native task as `completed`.
4.5. Update `.issues/issue-{N}.tasks.json`: find the entry by `index` (checklist position, 0-based), set `status: "completed"`, update `lastUpdated` to the current ISO timestamp, write back.
5. Change `- [ ]` to `- [x]` for this item in both `.issues/issue-{N}.plan.md` and `.issues/issue-{N}.md` (under `## Implementation Checklist`).
6. Call `issue_push` with the `.issues/` directory to sync all issues to GitHub.

## Subagent-Driven Execution

Fresh subagent per task + two-stage review (spec compliance then code quality). This prevents context pollution between tasks and catches issues early.

For each unchecked item in order:

### Step 1: Dispatch Implementer

Mark the native task as `in_progress`, then dispatch a subagent using the template in `implementer-prompt.md`. Provide:
- Full text of the checklist item
- Context about the issue and what's already implemented (load from `.issues/issue-{N}.plan.md` for the checklist context; the full spec is in `.issues/issue-{N}.md` if broader context is needed)
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
2. Update `.issues/issue-{N}.tasks.json`: find the entry by `index` (checklist position, 0-based), set `status: "completed"`, update `lastUpdated`, write back.
3. Change `- [ ]` to `- [x]` for this item in both `.issues/issue-{N}.plan.md` and `.issues/issue-{N}.md` (under `## Implementation Checklist`).
4. Call `issue_push` with the `.issues/` directory to sync all issues to GitHub.

Then proceed to the next unchecked item.

## Final Quality Review

After all checklist items are checked, before telling the user to run review:

1. **Run tests.** Look for test scripts in `package.json` (`scripts.test`), a `Makefile` (`make test`), or other common test runners. If tests fail, fix them and commit. Use `process:verify` — run the command, read the output, then claim the result.

2. **Run linter** if one exists (check `package.json` for a `lint` script, `Makefile` for a `lint` target, or common config files like `.eslintrc`, `ruff.toml`, `biome.json`). Fix any issues and commit.

3. **Dispatch a final code-review subagent** (using the `process:code-reviewer` agent) to review the full diff between the `issue-{number}` branch and `main`. This catches cross-task issues that per-task reviews miss: duplicated logic across tasks, inconsistent patterns, missing integration tests.

4. If the subagent returns findings: fix each issue, commit the fixes, and re-run (max 3 iterations).

5. After the review passes, call `issue_push` with the `.issues/` directory to sync all issues.

## Worktree Conventions

- **Directory:** `../worktree-issue-{number}` — a sibling to the main repo checkout
- **Branch:** `issue-{number}`
- Always work in the worktree directory, never on main/master
- **Never run `git checkout` or `git switch` in the main worktree.** Multiple Claude Code sessions share the same checkout — switching branches in the main worktree will break every other running session. All branch operations (checkout, merge, rebase) must happen inside an isolated worktree.
- The worktree is cleaned up by the finish-issue skill after merge

The sibling layout keeps the worktree easy to find and avoids nested worktrees. Example: if the repo lives at `~/git/my-project`, the worktree is at `~/git/worktree-issue-42`.

## Parallel Subagents with Worktree Isolation (Optional Optimization)

For checklists with independent tasks that touch non-overlapping files, you can dispatch implementers in parallel. Each runs in its own isolated worktree via the `Agent` tool's `isolation: "worktree"` parameter — the harness creates, tracks, and cleans up the temporary worktree for you. Default is still single-worktree sequential execution; this mode is opt-in.

**When to offer:** After parsing the checklist in step 1, analyze the unchecked tasks for file-path independence. Two tasks are independent if they modify entirely different sets of files (no shared file paths). If **2 or more** consecutive independent tasks are found, offer parallel mode:

> "Tasks N, M, ... appear independent (no overlapping files). I can work them in parallel, each in its own isolated worktree. Want to try that?"

If fewer than 2 independent tasks are found, **do not offer** this mode — fall through to normal subagent-driven execution.

### Prerequisites

- Execute must be running inside `../worktree-issue-{number}` when dispatching. Each isolation worktree branches off the current `HEAD`, so being on `issue-{number}` is how parallel work ends up on the feature branch. **Never dispatch with `isolation: "worktree"` from the main checkout** — the agents would branch off `main` and you'd have to cherry-pick.
- Stay in `../worktree-issue-{number}` for merge-back too. Never `git checkout` or `git switch` in the main checkout.

### How it works

**Step 1 — Dispatch all independent tasks in a single message.** This is what produces actual parallelism. Put every `Agent` tool call into one assistant message:

```
Agent(isolation: "worktree", prompt: <prompt for task N>)
Agent(isolation: "worktree", prompt: <prompt for task M>)
Agent(isolation: "worktree", prompt: <prompt for task ...>)
```

Mark each corresponding native task (`TaskUpdate`) as `in_progress` before dispatching. Sequential `Agent` calls across multiple messages are **not** parallel — they run one after another.

**Step 2 — Agent prompt contract.** Each dispatched agent's prompt must contain, at minimum:

1. The **full checklist line** (the `- [ ]` bullet) plus any indented sub-bullets that belong to that item.
2. A **pointer to the issue and its spec** for broader context: "See issue #{number} for the spec. Relevant sections: Problem, Acceptance Criteria, Edge Cases."
3. Explicit instruction to **implement the change and commit all work** inside the isolation worktree. Partial changes that aren't committed are lost when the harness cleans up.
4. Explicit instruction to **return the current branch name** as the last line of its response, using a delimited block so the driver can parse it reliably:

   ```
   ===BRANCH===
   <output of `git branch --show-current`>
   ===END===
   ```

   The harness creates a branch inside the isolation worktree; without this, execute cannot merge the work back.
5. The same status vocabulary as the sequential flow: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`.

**Step 3 — Merge returned branches sequentially into `issue-{number}`.** Once all parallel agents return, process them one at a time from inside `../worktree-issue-{number}`:

For each returned branch, in the original checklist order:

1. `git merge --no-ff <branch>` — keep a merge commit so the per-task work is visible in history. Do **not** rebase.
2. Run the per-item **Spec Compliance Review** and then **Code Quality Review** (same prompts and iteration limit as Subagent-Driven Execution above). Reviews run in the issue worktree, not the (possibly already-cleaned) isolation worktree.
3. **Only if both reviews pass:** tick `- [ ]` → `- [x]` in both `.issues/issue-{N}.plan.md` and `.issues/issue-{N}.md` (under `## Implementation Checklist`), call `issue_push` with the `.issues/` directory, mark the native task `completed`, and delete the merged branch with `git branch -d <branch>`.
4. If reviews fail, follow the existing review-iteration loop (max 3). Fixes happen in the issue worktree on top of the merge.

Do **not** tick the checkbox before the per-item review passes — a merged-but-broken item would otherwise be recorded as done.

### Conflict handling

- **Trivial conflict** (isolated hunk, obvious resolution): resolve in `../worktree-issue-{number}`, commit, continue with the next returned branch.
- **Non-trivial conflict** (multiple files, unclear resolution, or any conflict you cannot resolve on the first attempt): **abort remaining parallel merges**. Leave unmerged branches in place so the user can inspect them. Switch to sequential subagent-driven execution for all remaining unticked items, starting with the ones whose parallel branches were not merged.

### Edge cases

- **Agent returns no changes / no branch block / empty branch name.** `isolation: "worktree"` auto-cleans empty worktrees, so there is nothing to merge. Treat the item as `BLOCKED`. Do **not** silently tick it. Fall back to sequential subagent-driven execution for that item so the user sees the failure in the normal flow.
- **Post-merge review fails repeatedly.** Use the per-task review-iteration loop's max of 3. After 3 failed iterations, escalate to the user.
- **Agent reports `BLOCKED` or `NEEDS_CONTEXT`.** Same handling as the sequential subagent-driven section — re-dispatch with more context, break the task down, or escalate.
- **Two agents edit overlapping files despite the independence check.** The file-path heuristic is best-effort. First merge wins; the second hits the conflict path above.
- **Session interrupt mid-dispatch.** On resume: run `git worktree list`, identify any entries other than `../worktree-issue-{number}`, and prune stale ones (`git worktree remove --force`). Returned merge branches already committed into `issue-{number}` are safe. Unticked items are re-dispatched normally.

### Do not use this mode when

- Tasks have implicit ordering dependencies (later tasks use types/functions created by earlier tasks).
- The user hasn't opted in.
- There are fewer than 2 independent tasks.
- You are not currently `cd`'d inside `../worktree-issue-{number}`.

## Resuming Interrupted Work

If a previous session was interrupted mid-checklist:

- The issue body on GitHub shows which items are already checked (`- [x]`). These are complete — skip them.
- Continue from the first unchecked item (`- [ ]`).
- The worktree and branch should already exist from the previous session. Run `git worktree list` to confirm, then resume from that directory.
- If the previous session used Parallel Subagents mode, `git worktree list` may show stale isolation worktrees (anything other than `../worktree-issue-{number}`). Prune them with `git worktree remove --force` before resuming — unmerged work in those worktrees is already lost.
- Re-create native tasks only for the remaining unchecked items — don't create tasks for already-completed work.
- Re-derive `.issues/issue-{N}.plan.md` from the freshly pulled issue body (entry gate step 7) so the plan working file reflects current checked/unchecked state.

This is the crash-recovery model: GitHub is the persistent state (what's checked is done; what's unchecked is pending). `.issues/issue-{N}.tasks.json` provides task subjects and prior statuses for fast `TaskCreate` re-population — use it when available (step 7.5), fall back to checklist parsing when absent.

## Pitfalls

**Avoid:**
- Batching checklist syncs — call `issue_push` with the `.issues/` directory after each item so a crash doesn't lose progress
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

**Previous skill:** `plan-issue` (created the checklist in the issue body)

**Next skill:** `finish-issue` (creates PR and merges)

**No label transition** — issue stays `in-progress` while checklist items are ticked
