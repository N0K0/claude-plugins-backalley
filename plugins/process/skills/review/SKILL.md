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
   - **Check off in umbrella issue:**
     - Check the issue body for a `Parent: #N` line. If found, N is the umbrella issue number.
     - If no `Parent:` line, call `issue_search` with `body_contains: "#ISSUE_NUMBER"` and `state: open` to find issues whose body references this issue and contains a GitHub tasklist (`- [ ]` or `- [x]` items).
     - If no match is found, skip this step.
     - If multiple candidates are found, ask the user: "I found multiple issues referencing #N: #A, #B. Which is the umbrella issue, or none?"
     - If an umbrella issue is identified: call `issue_pull` for the umbrella, change `- [ ] #ISSUE_NUMBER` to `- [x] #ISSUE_NUMBER` in the umbrella's body, call `issue_push` for the umbrella. Tell the user: "Checked off #ISSUE_NUMBER in umbrella issue #N."
   - Clean up the worktree: `git worktree remove ../worktree-issue-{number}`
   - Delete the local branch from within the worktree or after removal — **never run `git checkout` in the main worktree** to do this. Use `git branch -D issue-{number}` from the main worktree (this deletes without switching branches) or from another worktree.
   - Confirm: "PR merged, issue #{N} closed, worktree cleaned up."

6. **If user chooses keep open:**
   - Tell the user the PR URL.
   - Do not clean up the worktree — the user may still need it.
   - Confirm: "PR is open at {url}. Merge manually when ready. The worktree at `../worktree-issue-{number}` is still available."

## Handling GitHub Feedback

When the user says "check for feedback", "there are review comments", or similar:

1. Get the timestamp of the last commit on the current branch: `git log -1 --format=%cI` in the worktree directory. (Use last commit, not `pulled_at`, because the feedback is on the code diff, not the issue body.)
2. Call `issue_comments_list` with `issue_number` and `since` set to that timestamp.
3. If no new comments are returned, tell the user: "No new comments on issue #N since the last commit."
4. If new comments are found, follow `process:receiving-review`:
   - Read all feedback before reacting.
   - If any item is unclear, ask for clarification before implementing anything.
   - Verify suggestions against codebase reality before implementing.
   - Push back with technical reasoning if feedback is incorrect.
   - Implement one item at a time, test each fix individually.
   - Commit each logical change with a descriptive message referencing the feedback.
5. Re-run the project's test suite to verify nothing is broken. Use `process:verify` — run the command, read the output, then claim the result.
6. If tests fail, fix the failures before proceeding.
7. Push the branch: `git push` from the worktree.
8. Present a summary of changes made to the user.

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
- Run `git checkout` or `git switch` in the main worktree (multiple sessions share it — switching branches breaks other running sessions)

**Always:**
- Run tests before creating the PR
- Include `Closes #N` in the PR body
- Let the user choose merge timing
- Clean up worktree after merge
- Perform all branch operations (merge, checkout, rebase) inside isolated worktrees, never in the main checkout

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_search`, `issue_comments_list`, `pr_create`, `pr_merge`), git worktrees

**Uses skills:**
- `process:receiving-review` — How to handle review feedback with technical rigor
- `process:verify` — Evidence before completion claims

**Previous skill:** `execute` (completed all checklist items)

**Label transition:** Issue closed automatically via `Closes #N` when PR merges
