---
name: lint-issues
description: "Audit open GitHub issues for workflow consistency — checks labels, spec completeness, checklist health, and cross-issue links. Triggers on: 'lint issues', 'audit issues', 'check issues'."
---
# Lint Issues

**Announce at start:** "I'm auditing open issues for workflow consistency."

**Core principle:** Report problems clearly. Don't fix anything — the user decides what to act on.

## Entry Gate

1. Call `detect_repo` to set repo context. If the tool is not available, stop with: "The gh plugin is required. Install it from the backalley marketplace."
2. Call `issue_pull` with `state: open` and the `.issues/` path to fetch all open issues.
3. Read all issue files from the `.issues/` directory.

If there are no open issues, stop with: "No open issues found."

## Checks

Run all four check categories on every open issue. Collect findings into a report — don't stop on the first problem.

### 1. Label/State Consistency

Each issue should have exactly one workflow label indicating its stage. Flag:

- **No workflow label:** Issue has none of `needs-spec`, `has-spec`, `in-progress`. → "Issue #N has no workflow label."
- **Multiple workflow labels:** Issue has more than one of `needs-spec`, `has-spec`, `in-progress`. → "Issue #N has conflicting labels: {labels}."
- **`has-spec` but empty body:** The issue has the `has-spec` label but no body content. → "Issue #N is labeled `has-spec` but has an empty body."
- **`in-progress` but no checklist:** The issue has `in-progress` but no `- [ ]` or `- [x]` items in the body. → "Issue #N is labeled `in-progress` but has no checklist."
- **`in-progress` but no branch:** Check if branch `issue-{N}` exists locally (`git branch --list issue-{N}`). If not, flag: "Issue #N is `in-progress` but branch `issue-{N}` doesn't exist locally."

### 2. Spec Completeness

For issues with the `has-spec` or `in-progress` label, check that the body contains all 5 required spec sections. Flag any that are missing or empty:

1. **Problem statement** — look for a heading containing "problem" (case-insensitive)
2. **Acceptance criteria** — look for a heading containing "acceptance" or "criteria"
3. **Edge cases** — look for a heading containing "edge"
4. **Scope boundaries** — look for a heading containing "scope"
5. **Dependencies** — look for a heading containing "dependenc"

For each missing section: "Issue #N is missing spec section: {section name}."

### 3. Checklist Health

For issues with `in-progress` label and a checklist:

- **Fully checked but still in-progress:** All items are `- [x]` but the issue is still open and labeled `in-progress`. → "Issue #N has all checklist items complete — ready for `review`."
- **No items checked:** All items are `- [ ]` and the issue has been `in-progress` for a while. → "Issue #N is `in-progress` but no checklist items are checked."
- **Stale:** Check `updated_at` from frontmatter. If more than 14 days ago, flag: "Issue #N hasn't been updated in {N} days."

### 4. Cross-Issue Consistency

- **Parent references:** If an issue body contains `Parent: #N`, verify that issue #N exists and is open. If #N is closed or doesn't exist: "Issue #M references Parent: #N, but #N is {closed/missing}."
- **Umbrella tasklists:** If an issue body contains a tasklist with `#N` references (`- [ ] #N` or `- [x] #N`), verify each referenced issue:
  - If #N is closed but still unchecked (`- [ ] #N`): "Umbrella #M has unchecked item #N, but #N is already closed."
  - If #N is open but checked (`- [x] #N`): "Umbrella #M has #N checked, but #N is still open."
  - If #N doesn't exist: "Umbrella #M references #N, which doesn't exist."

## Report Format

Group findings by severity, then by issue number:

```
## Issue Lint Report

### Errors (action needed)
- #12: Multiple workflow labels: `has-spec`, `in-progress`
- #15: Missing spec section: Acceptance criteria
- #18: Umbrella #5 has #18 checked, but #18 is still open

### Warnings (worth checking)
- #7: `in-progress` but branch `issue-7` doesn't exist locally
- #9: All checklist items complete — ready for `review`
- #20: Hasn't been updated in 21 days

### Summary
- 15 issues scanned
- 3 errors, 3 warnings
- 12 issues clean
```

**Severity rules:**
- **Error:** Conflicting labels, missing required spec sections, cross-issue mismatches
- **Warning:** Stale issues, completed checklists not yet reviewed, missing branches

If no findings: "All {N} open issues look good."

## Key Principles

- **Read-only** — never modify issues, labels, or files. Report only.
- **Scan everything** — don't stop on the first problem. Check all issues, all categories.
- **Be specific** — every finding should name the issue number and the exact problem.
- **Group by severity** — errors first, warnings second. The user reads top-down.

## Red Flags

**Never:**
- Modify issue files, labels, or state
- Call `issue_push` or `issue_update`
- Skip issues or categories

**Always:**
- Pull fresh issue state before scanning
- Check all four categories on every issue
- Report findings grouped by severity

## Integration

**Requires:** gh plugin (`detect_repo`, `issue_pull`), git (for branch existence checks)

**Standalone skill** — does not chain into or out of the workflow pipeline. Run it anytime to check project health.
