---
name: spec-issue
description: "Brainstorm requirements, propose approaches, and write a spec to a GitHub issue or a local markdown file. Triggers on: 'spec issue N', 'brainstorm issue N', 'spec out issue N', 'specify issue N', 'brainstorm <topic>'."
---
# Spec Issue

**Core principle:** One spec, one source of truth. The GitHub Issue body if we're using the issues workflow; otherwise a local markdown file at `docs/specs/<slug>.md`.

> **Built-in plan sync:** this skill is exempt — it does not modify issue checklists. See [`../_shared/builtin-plan-sync.md`](../_shared/builtin-plan-sync.md).

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

0. **Survey repo design docs.** Probe the repo root for a conventional design-doc directory, taking the first hit from this fixed list and stopping:
   - `docs/specs/`
   - `docs/design/`
   - `docs/rfcs/`
   - `spec/`
   - `specs/`

   If none exist, skip this step entirely — do NOT create a directory. If one exists, list its `*.md` files and read the first `#` heading plus any frontmatter `tags:` / `status:` from each. **Hold this list in memory ONLY for the conflict scan at step 7.** It does NOT feed into approach generation or Q&A framing — keeping it scoped to conflict detection prevents drift into "design-doc indexing." If a second conventional folder also exists, note it once to the user ("Also found `docs/design/` — only surveying `docs/specs/`.") and proceed with the first.

1. Read any existing context (issue body or local file body) for prior requirements or discussion. Use this as input — don't re-ask things already answered.

2. Ask clarifying questions one at a time using the `AskUserQuestion` tool. Follow these three conventions whenever calling the tool (also enforced in the Common Mistakes and Red Flags sections below):
   - **Prose framing first.** Output the question statement as user-facing prose immediately before the tool call, so the user sees the question in narrative flow before the UI prompt appears.
   - **Aim for four meaningful choices, one recommended.** Provide up to four distinct `options` (the tool's maximum). Put the recommended choice first with `"(Recommended)"` appended to its `label`. Use fewer than four only when additional options would be invented filler.
   - **Cap each `description` at two sentences.** Edit longer descriptions down rather than letting them sprawl.

   Wait for an answer before asking the next question. Focus on:
   - Purpose: what problem does this solve?
   - Constraints: what must it work with or within?
   - Success criteria: how do we know it's done?
   - Scope: what's explicitly out of scope?

3. Only one question per message. Don't bundle.

4. Once you understand the problem, propose 2-3 approaches with trade-offs. Lead with your recommended approach and explain why it's the best fit. Be concrete — name the approach, describe how it works, and call out the key trade-off.

5. **Section-by-section approval loop.** After the user picks an approach, execute this loop literally — do NOT batch sections:

   a. Identify N sections (typically: Problem statement, Approach, Acceptance criteria, Edge cases, Scope boundaries, Dependencies). Fix N before the loop starts and announce it to the user (e.g., "I'll present this in 6 sections.").
   b. For each section *i* in order, from 1 to N:
      i. Write section *i* as prose in the assistant's message (NOT in the issue body yet).
      ii. Call `AskUserQuestion` with question `Approve section i of N: <section name>?`. Options depend on whether the section is required or optional:
         - **Required sections** (Problem statement, Acceptance criteria, Edge cases, Scope boundaries, Dependencies — the five enforced by the Internal Review Loop's checklist gate): options are "Approve (Recommended)" and "Revise — I have changes". A `Skip` option is NOT offered; required sections cannot be skipped.
         - **Optional sections** (Approach comparison, Implementation notes, anything beyond the required five): options are "Approve (Recommended)", "Revise — I have changes", "Skip this section".
      iii. If `Approve`: append section *i*'s text to the in-progress spec buffer.
      iv. If `Revise`: collect the user's changes, regenerate section *i*, and repeat (ii) for the same *i*.
      v. If `Skip` (optional sections only): record a one-line stub `> Section "<name>" intentionally skipped during spec.` in the buffer and continue.
   c. After the loop, the assembled buffer is what gets written to the issue body / local file in step 7. Do not write to disk during the loop.

6. If the user mentions this issue is part of a larger initiative, include a `Parent: #N` (GH mode) or `Parent: docs/specs/<other>.md` (local mode) line at the top of the spec body when writing it.

7. Once all sections are approved, assemble the full spec and write it into:
   - **GH mode:** the local issue file body (do NOT push yet).
   - **Local mode:** the body of `docs/specs/<slug>.md`, below the frontmatter.

   **Conflict scan.** Immediately after writing the assembled body but before running the Internal Review Loop, walk the design-doc list from step 0 (if any). Precision target: **no false-negative budget; false positives are expected and acceptable.** For each surveyed doc ask: "Does the new spec contradict, supersede, or duplicate this doc?" — flag liberally; under-flagging is the failure mode. If any conflict is found, append a `## Conflicts with existing design docs` section to the spec body listing each conflict as a bullet:

   ```
   ## Conflicts with existing design docs
   - `docs/specs/2026-04-15-auth-model.md` — proposes session tokens; this spec
     proposes JWT. **Resolution deferred to execution.**
   ```

   The conflict section is informational. This skill MUST NOT attempt to resolve conflicts during spec writing — `execute-issue` owns resolution because spec-time the implementer has less context than execute-time. If no conflicts are found, omit the section entirely.

8. Run the internal review loop before presenting the spec to the user (see below).

9. **User approval gate.** Before any status transition or push, hand the assembled spec back to the user for explicit approval.

   a. Present the spec as a single message. Form is mechanical, not judgmental:
      - **If the assembled body is ≤ 120 lines:** paste the full body inline, preceded by the one-line preface `Full spec below (under 120 lines):`.
      - **If the assembled body is > 120 lines:** paste a recap — the first paragraph of the Problem statement plus the list of section headings — followed by the absolute file path. In GH mode, also include the GitHub URL if the issue's `url:` frontmatter is populated; if it is not (typical for a brand-new issue that hasn't been pushed yet), omit the URL line — the push at step 11 happens after this gate. Preface the recap with `Spec is N lines — showing recap; full file at <path>.`.
   b. Call `AskUserQuestion` with the question "Approve this spec as written?" and these options in this order:
      - "Approve as written (Recommended)" — proceed to follow-up items and status transition.
      - "Revise — I'll point out what to change" — wait for the user's edits, apply them, re-run the Internal Review Loop, and re-ask this gate.
      - "Discard — start over" — drop the body, keep the issue/file at `needs-spec`, and stop.
   c. The model MUST NOT call `issue_push` (GH mode) or update `status:` (local mode) before this gate returns "Approve as written."
   d. If section-by-section approval (step 5) was performed in full and every section was explicitly approved, this gate still runs — its role is "approve the assembled artifact," distinct from "approve each section." The framing may be shortened to "Same content you approved section-by-section, now assembled — confirm?" but the gate still runs.

10. **Create follow-up items for deferred decisions** (see Follow-Up Items below).

11. **Persist the spec:**
    - **GH mode:** call `issue_push` with the `.issues/` directory to sync the spec (and any follow-up issues) to GitHub. This is the only push in the entire flow. If `issue_push` fails, the local file under `.issues/` remains the source of truth — surface the error verbatim and do NOT transition status.
    - **Local mode:** the file is already written. If the write earlier failed because the parent directory was missing, retry once after `mkdir -p` on the parent; if it still fails, stop with the error surfaced verbatim — do not silently fall back to writing elsewhere.

12. **Transition status:**
    - **GH mode:** call `issue_update` to remove the `needs-spec` label and add `has-spec`.
    - **Local mode:** update the frontmatter `status: needs-spec` → `status: has-spec`.

13. **Tell the user where the spec lives.** Emit a structured block with absolute paths so the terminal can click them:

    - **GH mode:**

      ```
      Spec written to issue #{N}.
      File:  /abs/path/.issues/issue-{N}-{slug}.md
      URL:   https://github.com/{owner}/{repo}/issues/{N}
      Next:  run `plan-issue {N}` to create the implementation checklist.
      ```

      The URL comes from the issue file's `url:` frontmatter (set by `issue_push`). If it is missing, omit the URL line and add `URL unavailable — issue may not have been pushed yet.`.

    - **Local mode:**

      ```
      Spec written.
      File:  /abs/path/docs/specs/{slug}.md
      Next:  run `plan-issue docs/specs/{slug}.md` to create the implementation checklist.
      ```

      If `issue_push` failed in step 11 (GH mode), emit the file path only and add `Push to GitHub failed — local file at <path> is the current source of truth.` so the user can recover.

## Internal Review Loop

After writing the spec to its destination (step 7) but before the User approval gate (step 9), run this loop (max 5 iterations):

**a. Checklist gate (fast):** Verify the spec contains all 5 required sections. If any is missing or empty, add it to the spec.

1. **Problem statement** — what problem are we solving and for whom?
2. **Acceptance criteria** — concrete, testable conditions for "done"
3. **Edge cases** — what could go wrong, what are the boundary conditions?
4. **Scope boundaries** — what is explicitly out of scope?
5. **Dependencies** — what does this depend on, what depends on this?

**b. Subagent review (deep):** Dispatch a review subagent with these instructions: "Review the following spec for completeness, internal consistency, and clarity. Flag: vague acceptance criteria, contradictions between sections, unstated assumptions, missing error handling, scope creep beyond the stated problem. Return a list of specific issues found, or 'PASS' if the spec is ready." Pass the full spec text to the subagent.

**c. If the subagent returns issues:** Fix each issue in the spec, increment the iteration counter, and go back to step (a).

**d. If the subagent returns PASS or iteration count reaches 5:** Proceed to step 9 (User approval gate). If stopped at 5 iterations, tell the user at the approval gate: "Internal review found issues I couldn't fully resolve after 5 attempts. Please pay extra attention to the flagged areas before approving."

## Follow-Up Items

During the Q&A phase, the user often picks an approach but signals they may revisit the decision later. Watch for language like:

- "Let's start with X and see if Y is needed"
- "Go with X for now, we can switch to Y later"
- "X first, then benchmark/evaluate Y"
- Picking a partial option like "expose API now, integrate UI later"
- Any answer that scopes work down while acknowledging the remainder is still valuable

These are **deferred decisions** — the user chose a path but explicitly left the door open for an alternative.

After the User approval gate (step 9) returns "Approve as written," but before persisting (step 11):

1. Review the Q&A history for deferred decisions. Collect each one: what was chosen, what was deferred, and the trigger condition for revisiting.

2. If any deferred decisions were found, present them to the user as prose first (Rule 1), then call `AskUserQuestion` (`multiSelect: true`) so the user can pick which follow-ups to create. Strive for up to four meaningful options — typically a "Create all" option plus one option per deferred decision (Rule 2). Because this is a multi-select question, **omit `"(Recommended)"`** from the labels per the multi-select edge case in this issue's spec. Keep each option's `description` to two sentences or fewer (Rule 3).

3. For each approved follow-up, create:
   - **GH mode:** an issue file at `.issues/issue-new-{slug}.md` with `needs-spec` label, a brief context body, and `Parent: #N`. Pushed alongside the spec in step 11.
   - **Local mode:** a new file at `docs/specs/<slug>.md` with frontmatter `status: needs-spec`, a brief context body, and `Parent: docs/specs/<parent>.md`.

If no deferred decisions were found, skip this section silently.

## Handling Feedback (GH mode only)

When the user says "check for feedback", "there's feedback on GitHub", or similar (this section does not apply to local mode):

1. Get the timestamp from the local issue file's `pulled_at` frontmatter field.
2. Call `issue_comments_list` with `issue_number` and `since` set to that timestamp.
3. If no new comments, tell the user: "No new comments on issue #N since the last update."
4. If new comments are found, for each comment: summarize what the commenter is asking for, then apply the feedback to the spec in the local issue file.
5. Re-run the internal review loop on the updated spec, then re-run the User approval gate (step 9) before pushing.
6. Call `issue_push` with the `.issues/` directory.
7. Present a summary of changes made.

## Key Principles

- **One question at a time** — don't overwhelm the user with a list of questions
- **Multiple choice preferred** — easier to answer than open-ended, speeds up the process
- **YAGNI ruthlessly** — if a feature isn't clearly needed, cut it from the spec
- **Explore alternatives** — always propose 2-3 approaches before committing to one
- **Section-by-section approval** — don't dump the whole design at once; get buy-in as you go
- **Final assembled-spec approval is mandatory** — the section-by-section pass approves parts; the gate at step 9 approves the whole artifact, and both must happen
- **Spec lives in exactly one place** — the issue body OR the local file, never split
- **Conflicts are surfaced, not resolved** — note them in the spec body so `execute-issue` can handle them with full context

## Common Mistakes

**Problem:** Skipping mode detection and defaulting to GH when gh isn't installed.
**Fix:** Always run mode detection first. If `detect_repo` fails, use local mode.

**Problem:** Asking multiple questions at once.
**Fix:** One question per message. Wait for the answer. Then ask the next.

**Problem:** Writing multiple sections in a single assistant turn.
**Fix:** One section, one `AskUserQuestion`, then the next section. The section loop at step 5 is literal — do not batch.

**Problem:** Skipping the approach comparison.
**Fix:** Always propose 2-3 approaches before committing.

**Problem:** Running the Internal Review Loop and immediately transitioning status without asking the user.
**Fix:** Always run the User approval gate at step 9 before `issue_push` (GH) or any `status:` update (local).

**Problem:** Telling the user "spec written to issue #N" with no path and no URL.
**Fix:** Emit the structured `File: / URL: / Next:` block from step 13 every time.

**Problem:** Silently resolving a conflict with an existing design doc by adjusting the new spec to avoid contradiction.
**Fix:** Record the conflict in the `## Conflicts with existing design docs` section at step 7 and defer resolution to `execute-issue`.

**Problem:** Auto-mode is on, so the assistant skips the section-by-section or final approval gates.
**Fix:** Auto-mode is not a license to skip the approval gates. They are skill-mandated, not optional clarifications — the runtime queues the question if the user is away.

**Problem:** Forgetting the status transition.
**Fix:** GH mode — swap `needs-spec` → `has-spec` via `issue_update`. Local mode — update frontmatter `status:`.

**Problem:** Presenting the spec to the user without running internal review.
**Fix:** Always run the checklist gate + subagent review before the User approval gate.

**Problem:** Calling `AskUserQuestion` without surfacing the question in prose first.
**Fix:** Output the question statement as user-facing prose immediately before the tool call (Rule 1).

**Problem:** Offering only two or three options when four meaningful choices exist.
**Fix:** Aim for four distinct `options`, recommended first with `"(Recommended)"` in its `label` (Rule 2). Fewer is acceptable only when more would be invented filler.

**Problem:** Letting choice `description` text sprawl past two sentences.
**Fix:** Cap each `description` at two sentences (Rule 3). Edit longer descriptions down rather than leaving them long.

## Red Flags

**Never:**
- Skip user approval on any section of the design
- Call `issue_push` (GH) or set `status: has-spec` (local) before the User approval gate at step 9 returns "Approve as written"
- Skip the spec-folder survey at step 0 when one of the conventional directories exists
- Proceed without the `needs-spec` status being present (label in GH mode, frontmatter in local mode)
- Ask more than one question per message
- Call `AskUserQuestion` without first emitting the question statement as prose
- Let a choice `description` exceed two sentences
- Start implementation — this skill ends when the spec is written
- Write the spec in two places (e.g., both an issue body and a local file)

**Always:**
- Detect mode at the entry gate and announce which mode is active
- Run step 0's survey before the Q&A
- Ask one question at a time
- Emit the question as prose immediately before each `AskUserQuestion` call
- Aim for four meaningful `options`, recommended first with `"(Recommended)"`
- Run the section-by-section loop at step 5 literally
- Run internal review (checklist gate + subagent) before the User approval gate
- Run the User approval gate at step 9 before any push or status change
- Append a `## Conflicts with existing design docs` section when step 7's conflict scan finds any
- Emit the structured `File: / URL: / Next:` block at step 13
- Transition status after the spec is written and approved
- Tell the user what to run next (`plan-issue`)

## Integration

**Requires (GH mode only):** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_update`, `issue_comments_list`). Local mode has no external dependencies.

**Next skill:** `plan-issue` (creates the implementation checklist from the spec)

**Status transition:** `needs-spec` → `has-spec` (label in GH mode, frontmatter field in local mode)
