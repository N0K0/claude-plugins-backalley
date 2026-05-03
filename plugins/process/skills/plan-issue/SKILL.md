---
name: plan-issue
description: "Use when breaking a specified issue into implementation tasks — reads the spec from a GitHub issue body or a local markdown file, explores the codebase, and writes a checklist. Triggers on: 'plan issue N', 'break down issue N', 'checklist for issue N'."
---
# Plan Issue

**Announce at start:** "I'm using the plan-issue skill to break down <issue #N | docs/specs/<slug>.md> into tasks."

**Core principle:** The implementation checklist lives alongside the spec. GH mode appends it to the issue body; local mode appends it to `docs/specs/<slug>.md`. No separate plan files.

## Entry Gate

Before doing any work, detect the **mode** and run the mode-specific gate.

### Mode detection

1. If the user said "plan issue N" (numeric), that's **GH mode**.
2. If a local `docs/specs/<slug>.md` file was referenced (by slug or path), that's **local mode**.
3. If neither is explicit: prefer the mode whose artifact already exists. If `.issues/issue-{N}.md` exists → GH mode. If `docs/specs/<slug>.md` exists → local mode.
4. If still ambiguous and the gh plugin is available, call `detect_repo` and default to GH mode. If `detect_repo` is missing or fails, use local mode.
5. If both paths remain viable, ask once: "Plan against a GitHub issue or a local spec file?"

Announce the chosen mode at the start.

### GH mode gate

1. Call `issue_pull` with the `.issues/` directory path to sync all issues locally.
2. Read `.issues/issue-{N}.md` and check labels. If the `has-spec` label is NOT present, stop with: "Issue #{N} doesn't have the `has-spec` label. [If needs-spec: Run spec-issue first. If in-progress: Run execute-issue instead.]"
3. Check if the issue body already contains a `## Implementation Checklist` section. If it does, stop with: "Issue #{N} already has a checklist. Run execute-issue to work through it."

### Local mode gate

1. Read `docs/specs/<slug>.md` and check frontmatter `status:`. If not `has-spec`, stop with: "`docs/specs/<slug>.md` has status `<X>`. [If needs-spec: Run spec-issue. If in-progress: Run execute-issue.]"
2. Check if the file body already contains a `## Implementation Checklist` section. If it does, stop with: "`docs/specs/<slug>.md` already has a checklist. Run execute-issue to work through it."

Do not proceed past the entry gate unless all checks pass.

## The Process

1. Read the spec carefully (issue body or local file body). Understand the full scope: what is being built, what constraints apply, and what the success criteria are.

2. Explore the codebase to understand what needs to change. Look for:
   - Files and directories relevant to the feature area
   - Existing patterns and conventions to follow
   - Dependencies that the new code will rely on or affect
   - Tests and configuration that will need updating

3. Break the spec into ordered, concrete, file-level tasks. Each task should be independent enough to be completed in sequence without ambiguity. Order matters — scaffolding before implementation, implementation before tests, tests before docs.

4. Format the tasks as GitHub-flavored checkboxes under a `## Implementation Checklist` heading (see format below).

5. Show the checklist to the user for approval before persisting. Wait for explicit confirmation.

6. Once approved, append the checklist to the spec destination:
   - **GH mode:** append to the local issue file body, then call `issue_push` to sync.
   - **Local mode:** append to `docs/specs/<slug>.md`. No push.

7. **Link to umbrella (if applicable):**
   - Check the spec body for a `Parent: #N` line (GH mode) or `Parent: docs/specs/<other>.md` line (local mode).
   - **GH mode, no explicit parent:** call `issue_search` with `body_contains: "#ISSUE_NUMBER"` and `state: open`. Filter to results containing a GitHub tasklist that includes this issue. If exactly one match, that's the umbrella. If multiple, ask the user which.
   - **GH mode with umbrella:** check if `#ISSUE_NUMBER` already appears in the umbrella's tasklist; if not, append `- [ ] #ISSUE_NUMBER`. Synced on next `issue_push`.
   - **Local mode with umbrella:** append `- [ ] docs/specs/<child>.md` to the umbrella file's tasklist (create one if missing).

8. Create native Claude Code tasks via `TaskCreate` for session tracking — one task per checklist item.

8.5. **Write tasks.json** — After all `TaskCreate` calls complete, capture each native task ID from the tool result (`task.id`). Write a tasks persistence file co-located with the spec:
   - **GH mode:** `.issues/issue-{N}.tasks.json`
   - **Local mode:** `docs/specs/<slug>.tasks.json`

   Format:
   ```json
   {
     "issueNumber": 42,
     "specPath": ".issues/issue-42.md",
     "tasks": [
       {
         "index": 0,
         "subject": "Task 1: Create foo.ts with bar interface",
         "status": "pending",
         "nativeId": "<id from TaskCreate result>"
       }
     ],
     "lastUpdated": "<ISO timestamp>"
   }
   ```

   Omit `issueNumber` in local mode. `index` is 0-based and matches checklist order — it's the stable cross-session key. `nativeId` is session-scoped and will be refreshed on resume.

9. **Transition status:**
   - **GH mode:** call `issue_update` to remove `backlog` and `has-spec` labels and add `in-progress`.
   - **Local mode:** update the frontmatter `status: has-spec` → `status: in-progress`.

10. Tell the user: "Checklist added to <issue #N | docs/specs/<slug>.md>. Run `execute-issue` to start implementation."

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

**Problem:** Skipping mode detection and defaulting to GH when the spec lives in `docs/specs/`.
**Fix:** Always run mode detection first. If the spec file is local, stay in local mode.

**Problem:** Writing the plan to a separate file when the spec is elsewhere.
**Fix:** The checklist lives in the same place as the spec — issue body or `docs/specs/<slug>.md`.

**Problem:** Skipping codebase exploration.
**Fix:** Always explore first — patterns, file locations, and dependencies must inform the tasks.

**Problem:** Vague checklist items.
**Fix:** Every item should name specific files and describe a concrete change.

**Problem:** Forgetting native task creation or tasks.json.
**Fix:** Call `TaskCreate` for each checklist item, then write tasks.json with the resulting IDs so execute-issue can resume without re-parsing the checklist.

## Red Flags

**Never:**
- Skip codebase exploration before writing tasks
- Create checklist items without concrete file paths
- Persist the checklist without explicit user approval
- Split the spec and checklist across two storage locations

**Always:**
- Detect mode at the entry gate and announce which mode is active
- Explore the codebase first — patterns and locations matter
- Name specific files in each task
- Get user approval on the checklist before persisting
- Create native tasks for session tracking
- Write tasks.json with native IDs after all TaskCreate calls complete
- Link to umbrella if one exists
- Transition status after persisting

## Integration

**Requires (GH mode only):** gh plugin (`detect_repo`, `issue_pull`, `issue_push`, `issue_update`, `issue_search`). Local mode has no external dependencies.

**Previous skill:** `spec-issue` (wrote the spec)

**Next skill:** `execute-issue` (works through the checklist)

**Status transition:** `has-spec` (+ `backlog` in GH) → `in-progress`
