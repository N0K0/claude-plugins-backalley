---
name: review
description: "Use when an issue's checklist is fully complete — verifies tests, creates a PR, and optionally merges. Triggers on: 'review issue N', 'PR for issue N', 'merge issue N'."
---

# Review

**Announce at start:** "I'm using the review skill to create a PR for issue #N."

**Core principle:** The PR's `Closes #N` handles issue closure automatically. No manual label changes needed.

## Entry Gate

Before doing any work, run these checks in order:

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."
2. Call `issue_pull` to fetch the issue to a local file.
3. Read the issue file and check its labels.
4. If the `in-progress` label is NOT present, stop with: "Issue #{N} doesn't have the `in-progress` label. [If needs-spec: Run brainstorm first. If has-spec: Run plan first.]"
5. Parse the checklist. If ANY items are unchecked (`- [ ]`), stop with: "Issue #{N} has unchecked items. Run execute to complete them first."
6. Run the project's test commands. Look for test scripts in `package.json` (`scripts.test`), a `Makefile` (`make test`), or other common test runners. If tests fail, stop with: "Tests are failing. Run execute to fix them before creating a PR."

Do not proceed past the entry gate unless all six checks pass.

## The Process

1. **Verify checklist** — already confirmed complete in the entry gate. All items are checked (`- [x]`).

2. **Verify tests** — already confirmed passing in the entry gate.

3. **Create the PR** via `pr_create`:
   - Title: the issue title
   - Body: `Closes #{number}` followed by a summary section listing the checklist items as bullet points
   - Head branch: `issue-{number}`
   - Base branch: `main`

   Example PR body:
   ```
   Closes #42

   ## Summary
   - Added foo handler to src/handlers/foo.ts
   - Updated tests in src/handlers/foo.test.ts
   - Updated README with new usage
   ```

4. **Present the user with two options:**

   - **Merge now** — squash merge via `pr_merge`, issue closes automatically via `Closes #N`
   - **Keep PR open** — leave it for external review, user merges manually later

   Wait for the user's explicit choice before proceeding.

5. **If user chooses merge:**
   - Call `pr_merge` with squash strategy.
   - Clean up the worktree: `git worktree remove ../worktree-issue-{number}`
   - Delete the local branch: `git branch -D issue-{number}`
   - Confirm: "PR merged, issue #{N} closed, worktree cleaned up."

6. **If user chooses keep open:**
   - Tell the user the PR URL.
   - Do not clean up the worktree — the user may still need it.
   - Confirm: "PR is open at {url}. Merge manually when ready. The worktree at `../worktree-issue-{number}` is still available."

## Common Mistakes

**Problem:** Creating a PR without running tests.
**Fix:** Always run tests in the entry gate. Broken PRs waste review time.

**Problem:** Manually closing the issue.
**Fix:** Let `Closes #N` in the PR body handle it. Manual closure skips the PR audit trail.

**Problem:** Forgetting to clean up the worktree after merge.
**Fix:** Remove the worktree and delete the branch after a successful merge.

## Red Flags

**Never:**
- Create a PR without running tests
- Manually close the issue (let `Closes #N` handle it)
- Skip the user's merge/keep-open choice
- Clean up the worktree if the PR is kept open

**Always:**
- Run tests before creating the PR
- Include `Closes #N` in the PR body
- Let the user choose merge timing
- Clean up worktree after merge

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `pr_create`, `pr_merge`), git worktrees

**Previous skill:** `execute` (completed all checklist items)

**Label transition:** Issue closed automatically via `Closes #N` when PR merges
