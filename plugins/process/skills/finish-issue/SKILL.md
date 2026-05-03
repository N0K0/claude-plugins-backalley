---
name: finish-issue
description: "Use when an issue's checklist is fully complete — verifies tests, creates a PR, and optionally merges. Triggers on: 'finish issue N', 'review issue N', 'PR for issue N', 'merge issue N'."
---
# Finish Issue

**Announce at start:** "I'm using the finish-issue skill to wrap up issue #N."

**Core principle:** When the PR is merged via GitHub, `Closes #N` handles closure server-side. When the branch is merged locally and pushed, this skill closes the issue by setting `state: closed` in the local frontmatter and pushing it.

## Entry Gate

Before doing any work, run these checks in order:

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."
2. Call `issue_pull` with the `.issues/` directory path to sync all issues locally.
3. Read the issue file (`.issues/issue-{N}.md`) and check its labels.
4. If the `in-progress` label is NOT present, stop with: "Issue #{N} doesn't have the `in-progress` label. [If needs-spec: Run spec-issue first. If has-spec: Run plan-issue first.]"
5. Parse the checklist. If ANY items are unchecked (`- [ ]`), stop with: "Issue #{N} has unchecked items. Run execute-issue to complete them first."
6. Run the project's test commands. Look for test scripts in `package.json` (`scripts.test`), a `Makefile` (`make test`), or other common test runners. If tests fail, stop with: "Tests are failing. Run execute-issue to fix them before creating a PR."

Do not proceed past the entry gate unless all six checks pass.

## The Process

1. **Verify checklist** — already confirmed complete in the entry gate. All items are checked (`- [x]`).

2. **Verify tests** — already confirmed passing in the entry gate.

3. **Present the user with three options:**

   - **Merge via PR (recommended)** — create a PR with `Closes #N` in the body, then squash merge. GitHub closes the issue automatically.
   - **Keep PR open** — create a PR but leave it for external review.
   - **Merge locally instead of via PR** — skip `pr_create`. The user merges the branch into `main` themselves and pushes. This skill then closes the issue via frontmatter flip + `issue_push`.

   Wait for the user's explicit choice before proceeding.

4. **If user chooses merge via PR:**
   - Call `pr_create`:
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

   - Call `pr_merge` with squash strategy.
   - Run the **Umbrella Checkoff sub-procedure** (see below).
   - Clean up the worktree: `git worktree remove ../worktree-issue-{number}`
   - Delete the local branch: `git branch -D issue-{number}` from the main worktree — **never run `git checkout`**.
   - Confirm: "PR merged, issue #{N} closed, worktree cleaned up."

5. **If user chooses keep PR open:**
   - Call `pr_create` (same body as above with `Closes #{number}`).
   - Tell the user the PR URL.
   - Do not clean up the worktree — the user may still need it.
   - Confirm: "PR is open at {url}. Merge manually when ready. The worktree at `../worktree-issue-{number}` is still available."

6. **If user chooses merge locally:**
   - Confirm with the user that the merge + push to `main` has actually happened. If not, stop and ask them to merge and push first, then come back.
   - Edit `.issues/issue-{N}.md` frontmatter: set `state: closed`. Leave all other fields untouched.
   - Run the **Umbrella Checkoff sub-procedure** (see below).
   - Call `issue_push` with the `.issues/` directory to sync the state change (and any umbrella checkbox change) to GitHub.
   - Clean up the worktree: `git worktree remove ../worktree-issue-{number}`
   - Delete the local branch: `git branch -D issue-{number}` from the main worktree — **never run `git checkout`**.
   - Confirm: "Issue #{N} closed locally and pushed to GitHub. Worktree cleaned up."

## Umbrella Checkoff Sub-procedure

Run this after merging (either path). ISSUE_NUMBER refers to the issue just finished.

1. Check the issue body for a `Parent: #M` line. If found, M is the umbrella issue number.
2. If no `Parent:` line, call `issue_search` with `body_contains: "#ISSUE_NUMBER"` and `state: open` to find issues whose body references this issue and contains a GitHub tasklist (`- [ ]` or `- [x]` items).
3. If no match is found, skip the rest of this sub-procedure.
4. If multiple candidates are found, ask the user: "I found multiple issues referencing #ISSUE_NUMBER: #A, #B. Which is the umbrella issue, or none?"
5. Change `- [ ] #ISSUE_NUMBER` to `- [x] #ISSUE_NUMBER` in the umbrella's body.
6. Parse the umbrella's full tasklist after the edit. Count remaining `- [ ]` items. If every checklist item is now `- [x]` (zero unchecked remain), also set the umbrella file's frontmatter `state: closed`. Tell the user: "Umbrella issue #M is now fully complete — closing it as well."
7. Call `issue_push` with the `.issues/` directory to sync the umbrella checkbox flip (and possible state flip) upstream.
8. If the umbrella was closed in step 6, recursively run this sub-procedure on the umbrella itself (treating #M as the new ISSUE_NUMBER) to check off #M in *its* parent. Cap recursion at 5 levels to guard against cycles.

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

**Problem:** Manually closing the issue in the PR-merge path.
**Fix:** Let `Closes #N` in the PR body handle it. Manual closure skips the PR audit trail.

**Problem:** Flipping `state: closed` in the local-merge path before the merge has been pushed.
**Fix:** Always confirm the merge + push to `main` has actually happened before editing the frontmatter. Closing prematurely can leave an issue closed even if the merge is later abandoned.

**Problem:** Forgetting to clean up the worktree after merge.
**Fix:** Remove the worktree and delete the branch after a successful merge.

## Red Flags

**Never:**
- Create a PR without running tests
- Manually close the issue via the GitHub UI or `gh issue close` when using the PR-merge path (let `Closes #N` handle it); in the local-merge path, frontmatter flip + `issue_push` IS the correct closure mechanism
- Skip the user's merge/keep-open/merge-locally choice
- Clean up the worktree if the PR is kept open
- Run `git checkout` or `git switch` in the main worktree (multiple sessions share it — switching branches breaks other running sessions)
- Set `state: closed` locally before the merge + push to `main` has actually completed

**Always:**
- Run tests before creating the PR or closing locally
- Include `Closes #N` in the PR body (PR-merge path only)
- Let the user choose merge timing
- Clean up worktree after merge
- Perform all branch operations (merge, checkout, rebase) inside isolated worktrees, never in the main checkout
- Confirm the merge is pushed before flipping `state: closed` in the local-merge path

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_search`, `issue_comments_list`, `pr_create`, `pr_merge`), git worktrees

**Uses skills:**
- `process:receiving-review` — How to handle review feedback with technical rigor
- `process:verify` — Evidence before completion claims

**Previous skill:** `execute-issue` (completed all checklist items)

**Label transition:** Issue closed via `Closes #N` (PR-merge path) or via local frontmatter `state: closed` + `issue_push` (local-merge path).
