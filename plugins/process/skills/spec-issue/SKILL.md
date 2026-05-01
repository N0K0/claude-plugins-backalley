---
name: spec-issue
description: "Brainstorm requirements, propose approaches, and write a spec to a GitHub issue or a local markdown file. Triggers on: 'spec issue N', 'brainstorm issue N', 'spec out issue N', 'specify issue N', 'brainstorm <topic>'."
---
# Spec Issue

**Core principle:** One spec, one source of truth. The GitHub Issue body if we're using the issues workflow; otherwise a local markdown file at `docs/specs/<slug>.md`.

## Entry Gate

Before doing any work, detect the **mode** (GH issues vs local markdown), then run the mode-specific gate.

### Mode detection

1. If the user said "brainstorm issue N" (numeric), that's **GH mode**.
2. If `.issues/` exists at the repo root and the gh plugin's `detect_repo` tool is available, default to **GH mode**.
3. If `docs/specs/<slug>.md` already exists for the topic, that's **local mode**.
4. Otherwise, call `detect_repo` to probe. If the tool is missing or returns an error, use **local mode**.
5. If both paths remain viable (gh is available AND no existing file disambiguates), ask once: "Write this spec to a GitHub issue or a local file at `docs/specs/<slug>.md`?" Default to GH.

Announce the chosen mode at the start of the run, e.g. "I'm using the spec-issue skill in **local mode** to spec out `<slug>`."

### GH mode gate

1. Call `issue_pull` with the `.issues/` directory path to sync all issues locally.
2. **Existing issue (issue number provided):** read `.issues/issue-{N}.md` and check labels. If the `needs-spec` label is NOT present, stop with: "Issue #{N} doesn't have the `needs-spec` label. [If has-spec: Run plan-issue instead. If in-progress: Run execute-issue instead.]"
3. **New issue:** create a new issue file at `.issues/issue-new.md` with a placeholder title, the `needs-spec` label, and an empty body. Do NOT push yet.

### Local mode gate

1. If `docs/specs/<slug>.md` exists, read it and check its frontmatter `status:` field. If `status` is not `needs-spec` (missing, or already `has-spec` / `in-progress`), stop with: "`docs/specs/<slug>.md` has status `<X>`. [If has-spec: Run plan-issue. If in-progress: Run execute-issue.]"
2. If the file doesn't exist, create it with this frontmatter and an empty body:

   ```yaml
   ---
   title: <placeholder — fill during Q&A>
   status: needs-spec
   ---
   ```

Do not proceed past the entry gate unless all checks pass.

## The Process

1. Read any existing context (issue body or local file body) for prior requirements or discussion. Use this as input — don't re-ask things already answered.

2. Ask clarifying questions one at a time using the `AskUserQuestion` tool. Prefer multiple choice when possible. Put the recommended answer first and mark it with "(Recommended)" in its label. Wait for an answer before asking the next question. Focus on:
   - Purpose: what problem does this solve?
   - Constraints: what must it work with or within?
   - Success criteria: how do we know it's done?
   - Scope: what's explicitly out of scope?

3. Only one question per message. Don't bundle.

4. Once you understand the problem, propose 2-3 approaches with trade-offs. Lead with your recommended approach and explain why it's the best fit. Be concrete — name the approach, describe how it works, and call out the key trade-off.

5. After the user picks an approach, break the design into sections. Present one section at a time, get explicit approval before moving to the next. Scale each section to its complexity.

6. If the user mentions this issue is part of a larger initiative, include a `Parent: #N` (GH mode) or `Parent: docs/specs/<other>.md` (local mode) line at the top of the spec body when writing it.

7. Once all sections are approved, assemble the full spec and write it into:
   - **GH mode:** the local issue file body (do NOT push yet).
   - **Local mode:** the body of `docs/specs/<slug>.md`, below the frontmatter.

8. Run the internal review loop before presenting the spec to the user (see below).

9. **Create follow-up items for deferred decisions** (see Follow-Up Items below).

10. **Persist the spec:**
    - **GH mode:** call `issue_push` with the `.issues/` directory to sync the spec (and any follow-up issues) to GitHub. This is the only push in the entire flow.
    - **Local mode:** the file is already written. No push.

11. **Transition status:**
    - **GH mode:** call `issue_update` to remove the `needs-spec` label and add `has-spec`.
    - **Local mode:** update the frontmatter `status: needs-spec` → `status: has-spec`.

12. Tell the user: "Spec written to <issue #N | docs/specs/<slug>.md>. Run `plan-issue` to create the implementation checklist."

## Internal Review Loop

After writing the spec to its destination (step 7) but before transitioning status (step 11), run this loop (max 5 iterations):

**a. Checklist gate (fast):** Verify the spec contains all 5 required sections. If any is missing or empty, add it to the spec.

1. **Problem statement** — what problem are we solving and for whom?
2. **Acceptance criteria** — concrete, testable conditions for "done"
3. **Edge cases** — what could go wrong, what are the boundary conditions?
4. **Scope boundaries** — what is explicitly out of scope?
5. **Dependencies** — what does this depend on, what depends on this?

**b. Subagent review (deep):** Dispatch a review subagent with these instructions: "Review the following spec for completeness, internal consistency, and clarity. Flag: vague acceptance criteria, contradictions between sections, unstated assumptions, missing error handling, scope creep beyond the stated problem. Return a list of specific issues found, or 'PASS' if the spec is ready." Pass the full spec text to the subagent.

**c. If the subagent returns issues:** Fix each issue in the spec, increment the iteration counter, and go back to step (a).

**d. If the subagent returns PASS or iteration count reaches 5:** Proceed to step 9 (follow-up items). If stopped at 5 iterations, tell the user: "Internal review found issues I couldn't fully resolve after 5 attempts. Presenting the spec as-is — please pay extra attention to the flagged areas."

## Follow-Up Items

During the Q&A phase, the user often picks an approach but signals they may revisit the decision later. Watch for language like:

- "Let's start with X and see if Y is needed"
- "Go with X for now, we can switch to Y later"
- "X first, then benchmark/evaluate Y"
- Picking a partial option like "expose API now, integrate UI later"
- Any answer that scopes work down while acknowledging the remainder is still valuable

These are **deferred decisions** — the user chose a path but explicitly left the door open for an alternative.

After the spec is written and reviewed (step 8), but before persisting (step 10):

1. Review the Q&A history for deferred decisions. Collect each one: what was chosen, what was deferred, and the trigger condition for revisiting.

2. If any deferred decisions were found, present them to the user and use `AskUserQuestion` to let them pick which follow-ups to create. Put "Create all" as the first (recommended) option.

3. For each approved follow-up, create:
   - **GH mode:** an issue file at `.issues/issue-new-{slug}.md` with `needs-spec` label, a brief context body, and `Parent: #N`. Pushed alongside the spec in step 10.
   - **Local mode:** a new file at `docs/specs/<slug>.md` with frontmatter `status: needs-spec`, a brief context body, and `Parent: docs/specs/<parent>.md`.

If no deferred decisions were found, skip this section silently.

## Handling Feedback (GH mode only)

When the user says "check for feedback", "there's feedback on GitHub", or similar (this section does not apply to local mode):

1. Get the timestamp from the local issue file's `pulled_at` frontmatter field.
2. Call `issue_comments_list` with `issue_number` and `since` set to that timestamp.
3. If no new comments, tell the user: "No new comments on issue #N since the last update."
4. If new comments are found, for each comment: summarize what the commenter is asking for, then apply the feedback to the spec in the local issue file.
5. Re-run the internal review loop on the updated spec.
6. Call `issue_push` with the `.issues/` directory.
7. Present a summary of changes made.

## Key Principles

- **One question at a time** — don't overwhelm the user with a list of questions
- **Multiple choice preferred** — easier to answer than open-ended, speeds up the process
- **YAGNI ruthlessly** — if a feature isn't clearly needed, cut it from the spec
- **Explore alternatives** — always propose 2-3 approaches before committing to one
- **Section-by-section approval** — don't dump the whole design at once; get buy-in as you go
- **Spec lives in exactly one place** — the issue body OR the local file, never split

## Common Mistakes

**Problem:** Skipping mode detection and defaulting to GH when gh isn't installed.
**Fix:** Always run mode detection first. If `detect_repo` fails, use local mode.

**Problem:** Asking multiple questions at once.
**Fix:** One question per message. Wait for the answer. Then ask the next.

**Problem:** Skipping the approach comparison.
**Fix:** Always propose 2-3 approaches before committing.

**Problem:** Forgetting the status transition.
**Fix:** GH mode — swap `needs-spec` → `has-spec` via `issue_update`. Local mode — update frontmatter `status:`.

**Problem:** Presenting the spec to the user without running internal review.
**Fix:** Always run the checklist gate + subagent review before transitioning status.

## Red Flags

**Never:**
- Skip user approval on any section of the design
- Proceed without the `needs-spec` status being present (label in GH mode, frontmatter in local mode)
- Ask more than one question per message
- Start implementation — this skill ends when the spec is written
- Write the spec in two places (e.g., both an issue body and a local file)

**Always:**
- Detect mode at the entry gate and announce which mode is active
- Ask one question at a time
- Run internal review (checklist gate + subagent) before transitioning status
- Transition status after the spec is written
- Tell the user what to run next (`plan-issue`)

## Integration

**Requires (GH mode only):** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_update`, `issue_comments_list`). Local mode has no external dependencies.

**Next skill:** `plan-issue` (creates the implementation checklist from the spec)

**Status transition:** `needs-spec` → `has-spec` (label in GH mode, frontmatter field in local mode)
