---
name: brainstorm
description: "Use when specifying a GitHub issue — brainstorm requirements, propose approaches, and write a spec into the issue body. Triggers on: 'brainstorm issue N', 'spec out issue N', 'specify issue N'."
---

# Brainstorm

**Announce at start:** "I'm using the brainstorm skill to spec out issue #N."

**Core principle:** The GitHub Issue body is the spec. No local files.

## Entry Gate

Before doing any work, run these checks in order:

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."
2. Call `issue_pull` to fetch the issue to a local file.
3. Read the issue file and check its labels.
4. If the `needs-spec` label is NOT present, stop with: "Issue #{N} doesn't have the `needs-spec` label. [If has-spec: Run plan instead. If in-progress: Run execute instead.]"

Do not proceed past the entry gate unless all four checks pass.

## The Process

1. Read the issue body for any existing context, requirements, or discussion. Use this as input — don't re-ask things already answered.

2. Ask clarifying questions one at a time. Prefer multiple choice when possible. Wait for an answer before asking the next question. Focus on:
   - Purpose: what problem does this solve?
   - Constraints: what must it work with or within?
   - Success criteria: how do we know it's done?
   - Scope: what's explicitly out of scope?

3. Only one question per message. Don't bundle.

4. Once you understand the problem, propose 2-3 approaches with trade-offs. Lead with your recommended approach and explain why it's the best fit. Be concrete — name the approach, describe how it works, and call out the key trade-off.

5. After the user picks an approach, break the design into sections. Present one section at a time, get explicit approval before moving to the next. Scale each section to its complexity — a few sentences if simple, more detail if the design is nuanced or has non-obvious consequences.

6. Once all sections are approved, assemble the full spec and write it into the issue body via `issue_push`.

7. Call `issue_update` to remove the `needs-spec` label and add `has-spec`.

8. Tell the user: "Spec written to issue #N. Run `plan` to create the implementation checklist."

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
- Transition labels after the spec is written (`needs-spec` → `has-spec`)
- Tell the user what to run next (`plan`)

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_update`)

**Next skill:** `plan` (creates implementation checklist from the spec)

**Label transition:** removes `needs-spec`, adds `has-spec`
