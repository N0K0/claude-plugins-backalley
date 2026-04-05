---
name: plan
description: "Use when breaking a specified issue into implementation tasks — reads the spec from the issue body, explores the codebase, and writes a checklist. Triggers on: 'plan issue N', 'break down issue N', 'checklist for issue N'."
---
# Plan

**Announce at start:** "I'm using the plan skill to break down issue #N into tasks."

**Core principle:** The implementation checklist lives in the issue body. No local plan files.

## Entry Gate

Before doing any work, run these checks in order:

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."
2. Call `issue_pull` to fetch the issue to a local file.
3. Read the issue file and check its labels.
4. If the `has-spec` label is NOT present, stop with: "Issue #{N} doesn't have the `has-spec` label. [If needs-spec: Run brainstorm first. If in-progress: Run execute instead.]"
5. Check if the issue body already contains a `## Implementation Checklist` section. If it does, stop with: "Issue #{N} already has a checklist. Run execute to work through it."

Do not proceed past the entry gate unless all five checks pass.

## The Process

1. Read the spec from the issue body carefully. Understand the full scope: what is being built, what constraints apply, and what the success criteria are.

2. Explore the codebase to understand what needs to change. Look for:
   - Files and directories relevant to the feature area
   - Existing patterns and conventions to follow
   - Dependencies that the new code will rely on or affect
   - Tests and configuration that will need updating

3. Break the spec into ordered, concrete, file-level tasks. Each task should be independent enough to be completed in sequence without ambiguity. Order matters — put scaffolding before implementation, implementation before tests, tests before docs.

4. Format the tasks as GitHub-flavored checkboxes under a `## Implementation Checklist` heading (see format below).

5. Show the checklist to the user for approval before pushing. Wait for explicit confirmation.

6. Once approved, append the checklist to the issue body below the spec. Write it back via `issue_push`.

7. **Link to umbrella issue (if applicable):**
   - Check the issue body for a `Parent: #N` line. If found, N is the umbrella issue number.
   - If no `Parent:` line exists, call `issue_search` with `body_contains: "#ISSUE_NUMBER"` and `state: open` to find issues whose body references this issue. Filter results to those containing a GitHub tasklist (`- [ ]` or `- [x]` items) that includes this issue number. If exactly one match is found, that is the umbrella.
   - If multiple candidates are found, ask the user: "I found multiple issues referencing #N: #A, #B. Which is the umbrella issue, or none?"
   - If an umbrella issue is identified: call `issue_pull` for the umbrella issue, check if `#ISSUE_NUMBER` already appears in the umbrella's tasklist, and if not, append `- [ ] #ISSUE_NUMBER` to the umbrella's tasklist and call `issue_push` for the umbrella.

8. Create native Claude Code tasks via `TaskCreate` for session tracking — one task per checklist item.

9. Call `issue_update` to remove the `backlog` and `has-spec` labels and add `in-progress`.

10. Tell the user: "Checklist added to issue #N. Run `execute` to start implementation."

## Checklist Format

Tasks go under a `## Implementation Checklist` heading using GitHub-flavored checkboxes:

```markdown
## Implementation Checklist
- [ ] Task 1: Create foo.ts with bar interface
- [ ] Task 2: Implement baz handler
- [ ] Task 3: Update README with new usage
```

Tasks should be concrete and file-level — "Create X in Y" or "Modify Z to add W", not vague like "set up the backend". Each item should be actionable by someone who hasn't read the spec.

## Common Mistakes

**Problem:** Writing the plan to a local file.
**Fix:** The checklist lives in the issue body. Push via `issue_push`. Local plan files are out of scope and will be stale immediately.

**Problem:** Skipping codebase exploration.
**Fix:** Always explore first — you need to know existing patterns, file locations, and dependencies before writing concrete tasks. A checklist written without exploration will contain wrong file names, duplicate code, and missed edge cases.

**Problem:** Vague checklist items.
**Fix:** Every item should name specific files and describe a concrete change. "Implement the feature" is too vague. "Add `handleFoo` to `src/handlers/foo.ts`" is concrete.

**Problem:** Forgetting native task creation.
**Fix:** Call `TaskCreate` for each checklist item so progress is visible in the session. Without this, the session has no awareness of what's been done.

## Red Flags

**Never:**
- Write the plan to a local file
- Skip codebase exploration before writing tasks
- Create checklist items without concrete file paths
- Push the checklist without explicit user approval

**Always:**
- Explore the codebase first — patterns and locations matter
- Name specific files in each task
- Get user approval on the checklist before pushing
- Create native tasks for session tracking
- Link to umbrella issue if one exists
- Transition labels after pushing (`backlog` + `has-spec` → `in-progress`)

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_update`, `issue_search`)

**Previous skill:** `brainstorm` (wrote the spec into the issue body)

**Next skill:** `execute` (works through the checklist)

**Label transition:** removes `backlog` + `has-spec`, adds `in-progress`
