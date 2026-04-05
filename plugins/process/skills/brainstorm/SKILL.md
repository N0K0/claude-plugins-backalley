---
name: brainstorm
description: "Brainstorm requirements, propose approaches, and write a spec into a GitHub issue. Triggers on: 'brainstorm issue N', 'spec out issue N', 'specify issue N', 'brainstorm <topic>'."
---
# Brainstorm

**Core principle:** The GitHub Issue body is the spec. No local files.

## Entry Gate

Before doing any work, run these checks in order:

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."

Then determine which flow to follow:

### Flow A: Existing issue (issue number provided)

2. Call `issue_pull` with the `.issues/` directory path to sync all issues locally.
3. Read the issue file (`.issues/issue-{N}.md`) and check its labels.
4. If the `needs-spec` label is NOT present, stop with: "Issue #{N} doesn't have the `needs-spec` label. [If has-spec: Run plan instead. If in-progress: Run execute instead.]"
5. Announce: "I'm using the brainstorm skill to spec out issue #N."

### Flow B: New issue (no issue number, or user describes a new idea)

2. Announce: "I'm using the brainstorm skill to spec out a new issue."
3. Create a new issue file at `.issues/issue-new.md` with a placeholder title, the `needs-spec` label, and an empty body. Do NOT push yet — the title and body will be filled in during the brainstorm process.
4. Proceed directly to The Process below.

At the end of Flow B (after the spec is written and reviewed), push the `.issues/` directory via `issue_push` to sync all issues to GitHub. The push tool returns results per file — for the new issue, it returns the new filename (e.g., `issue-42.md`) and issue number. Use these to reference the issue for the rest of the flow (label transition, telling the user the issue number, etc.).

Do not proceed past the entry gate unless all checks pass.

## The Process

1. Read the issue body for any existing context, requirements, or discussion. Use this as input — don't re-ask things already answered.

2. Ask clarifying questions one at a time using the `AskUserQuestion` tool. Prefer multiple choice when possible. Put the recommended answer first and mark it with "(Recommended)" in its label. Wait for an answer before asking the next question. Focus on:
   - Purpose: what problem does this solve?
   - Constraints: what must it work with or within?
   - Success criteria: how do we know it's done?
   - Scope: what's explicitly out of scope?

3. Only one question per message. Don't bundle.

4. Once you understand the problem, propose 2-3 approaches with trade-offs. Lead with your recommended approach and explain why it's the best fit. Be concrete — name the approach, describe how it works, and call out the key trade-off.

5. After the user picks an approach, break the design into sections. Present one section at a time, get explicit approval before moving to the next. Scale each section to its complexity — a few sentences if simple, more detail if the design is nuanced or has non-obvious consequences.

6. If the user mentions this issue is part of a larger initiative or umbrella issue, include a `Parent: #N` line at the top of the spec body when writing it.

7. Once all sections are approved, assemble the full spec and write it into the issue body. Call `issue_push` with the `.issues/` directory to sync all issues.

8. Run the internal review loop before presenting the spec to the user (see below).

9. **Create follow-up issues for deferred decisions** (see Follow-Up Issues below).

10. Call `issue_update` to remove the `needs-spec` label and add `has-spec`.

11. Tell the user: "Spec written to issue #N. Run `plan` to create the implementation checklist."

## Internal Review Loop

After writing the spec to the issue body (step 7) but before transitioning labels (step 9), run this loop (max 5 iterations):

**a. Checklist gate (fast):** Verify the spec contains all 5 required sections. If any is missing or empty, add it and re-push the `.issues/` directory via `issue_push`.

1. **Problem statement** — what problem are we solving and for whom?
2. **Acceptance criteria** — concrete, testable conditions for "done"
3. **Edge cases** — what could go wrong, what are the boundary conditions?
4. **Scope boundaries** — what is explicitly out of scope?
5. **Dependencies** — what does this depend on, what depends on this?

**b. Subagent review (deep):** Dispatch a review subagent with these instructions: "Review the following spec for completeness, internal consistency, and clarity. Flag: vague acceptance criteria, contradictions between sections, unstated assumptions, missing error handling, scope creep beyond the stated problem. Return a list of specific issues found, or 'PASS' if the spec is ready." Pass the full spec text to the subagent.

**c. If the subagent returns issues:** Fix each issue in the spec, re-push the `.issues/` directory via `issue_push`, increment the iteration counter, and go back to step (a).

**d. If the subagent returns PASS or iteration count reaches 5:** Proceed to step 9. If stopped at 5 iterations, tell the user: "Internal review found issues I couldn't fully resolve after 5 attempts. Presenting the spec as-is — please pay extra attention to the flagged areas."

## Follow-Up Issues

During the Q&A phase, the user often picks an approach but signals they may revisit the decision later. Watch for language like:

- "Let's start with X and see if Y is needed"
- "Go with X for now, we can switch to Y later"
- "X first, then benchmark/evaluate Y"
- "Start with X and go over to Y if needed"
- Picking a partial option like "expose API now, integrate UI later" (option B when A = full scope, C = skip entirely)
- Any answer that scopes work down while acknowledging the remainder is still valuable

These are **deferred decisions** — the user chose a path but explicitly left the door open for an alternative.

After the spec is written and reviewed (step 8), but before transitioning labels (step 10):

1. Review the Q&A history for deferred decisions. Collect each one: what was chosen, what was deferred, and the trigger condition for revisiting (e.g., "if performance is too slow", "if the simpler approach isn't enough").

2. If any deferred decisions were found, present them to the user:

   ```
   I noticed N deferred decisions during brainstorming. Want me to create
   follow-up issues so they don't get lost?

   1. "Evaluate dropping Lezer if WASM highlighting is fast enough"
      Trigger: after initial implementation, benchmark WASM load time
   2. "Switch to typed wasm-bindgen structs if JsValue becomes a bottleneck"
      Trigger: if serialization overhead is noticeable on keystroke
   ```

3. Use the `AskUserQuestion` tool to let the user pick which follow-ups to create. Put "Create all" as the first (recommended) option.

4. For each approved follow-up, create an issue file at `.issues/issue-new-{slug}.md` with:
   - Title: the deferred decision as a clear action (e.g., "Evaluate dropping Lezer for WASM-only highlighting")
   - Label: `needs-spec`
   - Body: brief context — what was decided in the parent issue, what would trigger revisiting, and a link back (`Parent: #N`)

5. Call `issue_push` with the `.issues/` directory to create the follow-up issues on GitHub.

If no deferred decisions were found, skip this section silently.

## Handling GitHub Feedback

When the user says "check for feedback", "there's feedback on GitHub", or similar:

1. Get the timestamp from the local issue file's `pulled_at` frontmatter field — this is the cutoff. (Use `pulled_at` because the work product is the issue body itself, so the last sync time is the right boundary.)
2. Call `issue_comments_list` with `issue_number` and `since` set to that timestamp.
3. If no new comments are returned, tell the user: "No new comments on issue #N since the last update."
4. If new comments are found, for each comment:
   - Summarize what the commenter is asking for.
   - Apply the feedback to the spec in the local issue file.
5. Call `issue_push` with the `.issues/` directory to sync all issues to GitHub.
6. Re-run the internal review loop on the updated spec.
7. Present a summary of changes made to the user.

## Key Principles

- **One question at a time** — don't overwhelm the user with a list of questions
- **Multiple choice preferred** — easier to answer than open-ended, speeds up the process
- **YAGNI ruthlessly** — if a feature isn't clearly needed, cut it from the spec
- **Explore alternatives** — always propose 2-3 approaches before committing to one
- **Section-by-section approval** — don't dump the whole design at once; get buy-in as you go
- **Issue body is the spec** — never write spec content to local files; it lives in GitHub

## Common Mistakes

**Problem:** Writing the spec to a local file.
**Fix:** Always write to the issue body via `issue_push`. The issue is the single source of truth.

**Problem:** Asking multiple questions at once.
**Fix:** One question per message. Wait for the answer. Then ask the next.

**Problem:** Skipping the approach comparison.
**Fix:** Always propose 2-3 approaches before committing. This surfaces assumptions and gives the user a real choice.

**Problem:** Forgetting the label transition.
**Fix:** Always call `issue_update` to swap `needs-spec` → `has-spec` after writing the spec.

**Problem:** Presenting the spec to the user without running internal review.
**Fix:** Always run the checklist gate + subagent review before transitioning labels. This catches obvious gaps before the user has to.

## Red Flags

**Never:**
- Write spec content to a local file
- Skip user approval on any section of the design
- Proceed without the `needs-spec` label being present
- Ask more than one question per message
- Start implementation — this skill ends when the spec is written

**Always:**
- Ask one question at a time
- Write the spec to the issue body via `issue_push`
- Run internal review (checklist gate + subagent) before presenting the spec
- Transition labels after the spec is written (`needs-spec` → `has-spec`)
- Tell the user what to run next (`plan`)

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_update`, `issue_comments_list`)

**Next skill:** `plan` (creates implementation checklist from the spec)

**Label transition:** removes `needs-spec`, adds `has-spec`
