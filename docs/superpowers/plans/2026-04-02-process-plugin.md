# Process Plugin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `plugins/process/` plugin with four skills (brainstorm, plan, execute, review) that orchestrate a GitHub Issues-driven development workflow using the gh MCP plugin.

**Architecture:** Each skill is a standalone SKILL.md that calls gh MCP tools to read/write issues, manage labels, create worktrees, and open PRs. GitHub Issues are the single source of truth. Labels encode workflow state.

**Tech Stack:** Claude Code skills (SKILL.md markdown), gh MCP tools (detect_repo, issue_pull, issue_push, issue_update, label_create, pr_create, pr_merge)

**Spec:** `docs/superpowers/specs/2026-04-02-process-plugin-design.md`

---

## Chunk 1: Plugin Scaffold

### Task 0: Plugin scaffold

**Files:**
- Create: `plugins/process/.claude-plugin/plugin.json`
- Create: `plugins/process/LICENSE`
- Create: `plugins/process/README.md` (placeholder — finalized in Task 5)

- [ ] **Step 1: Create plugin.json**

```json
{
  "name": "process",
  "description": "GitHub Issues-driven development workflow — brainstorm, plan, execute, review",
  "author": {
    "name": "nikolas"
  },
  "version": "0.1.0",
  "keywords": ["workflow", "process", "github", "issues", "development"]
}
```

Write to `plugins/process/.claude-plugin/plugin.json`.

- [ ] **Step 2: Create LICENSE**

Copy the MIT license from `plugins/gh/LICENSE` to `plugins/process/LICENSE`. Update copyright holder to match.

- [ ] **Step 3: Create placeholder README**

Write a minimal README to `plugins/process/README.md`:

```markdown
# process Plugin

GitHub Issues-driven development workflow with four skills: brainstorm, plan, execute, review.

Requires the `gh` plugin to be installed.

## Skills

| Skill | Phase | Label Transition |
|-------|-------|-----------------|
| brainstorm | Specification | needs-spec → has-spec |
| plan | Planning | has-spec → in-progress |
| execute | Implementation | ticks checklist items |
| review | PR & merge | in-progress → closed |
```

- [ ] **Step 4: Commit scaffold**

```bash
git add plugins/process/.claude-plugin/plugin.json plugins/process/LICENSE plugins/process/README.md
git commit -m "feat(process): scaffold plugin with metadata, license, readme"
```

---

## Chunk 2: Skills

Each skill follows the same SKILL.md pattern:
- YAML frontmatter with `name` and `description`
- Guard section checking gh plugin availability and issue state
- Step-by-step workflow
- Common mistakes and red flags sections

### Task 1: Brainstorm skill

**Files:**
- Create: `plugins/process/skills/brainstorm/SKILL.md`

**Reference:** Spec section "Skill: brainstorm" + superpowers brainstorming skill for conversational patterns.

- [ ] **Step 1: Write SKILL.md frontmatter**

```yaml
---
name: brainstorm
description: "Use when specifying a GitHub issue — brainstorm requirements, propose approaches, and write a spec into the issue body. Triggers on: 'brainstorm issue N', 'spec out issue N', 'specify issue N'."
---
```

- [ ] **Step 2: Write SKILL.md body**

The skill must include these sections in order:

1. **Title & overview** — "Brainstorm" heading, announce text, core principle (GitHub Issue = single source of truth)
2. **Guard rail** — Check gh plugin (`detect_repo`), `issue_pull` the issue, validate `needs-spec` label. If wrong state, redirect to correct skill.
3. **The process** — numbered steps:
   - Read issue body for existing context
   - Ask clarifying questions one at a time (prefer multiple choice)
   - Propose 2-3 approaches with recommendation
   - Present design sections, get user approval after each
   - Write spec into issue body via `issue_push`
   - Label transition: `issue_update` to remove `needs-spec`, add `has-spec`
   - Tell user: "Run plan next"
4. **Key principles** — one question at a time, multiple choice preferred, YAGNI, section-by-section approval
5. **Common mistakes** — skipping clarification, writing spec locally instead of in issue, forgetting label transition
6. **Red flags** — Never: write spec to local file, skip user approval, proceed without `needs-spec` label. Always: one question at a time, write spec to issue body, transition labels.

Target: ~1500 words.

- [ ] **Step 3: Commit**

```bash
git add plugins/process/skills/brainstorm/SKILL.md
git commit -m "feat(process): add brainstorm skill"
```

### Task 2: Plan skill

**Files:**
- Create: `plugins/process/skills/plan/SKILL.md`

**Reference:** Spec section "Skill: plan" + superpowers writing-plans skill for checklist patterns.

- [ ] **Step 1: Write SKILL.md frontmatter**

```yaml
---
name: plan
description: "Use when breaking a specified issue into implementation tasks — reads the spec from the issue body, explores the codebase, and writes a checklist. Triggers on: 'plan issue N', 'break down issue N', 'checklist for issue N'."
---
```

- [ ] **Step 2: Write SKILL.md body**

The skill must include these sections in order:

1. **Title & overview** — "Plan" heading, announce text, core principle (checklist lives in issue body)
2. **Guard rail** — Check gh plugin, `issue_pull`, validate `has-spec` label and no existing checklist. If wrong state, redirect.
3. **The process** — numbered steps:
   - Read spec from issue body
   - Explore codebase (files, patterns, dependencies relevant to the spec)
   - Break spec into ordered, concrete, file-level tasks
   - Format as GitHub-flavored checkboxes under `## Implementation Checklist` heading
   - Append checklist to issue body, `issue_push`
   - Create native Claude Code tasks via `TaskCreate` for session tracking
   - Label transition: `issue_update` to remove `backlog` + `has-spec`, add `in-progress`
   - Tell user: "Run execute next"
4. **Checklist format** — show the exact markdown format with `- [ ]` items
5. **Common mistakes** — tasks too vague, forgetting to explore codebase first, writing plan to local file
6. **Red flags** — Never: write plan locally, skip codebase exploration, create checklist without concrete file paths. Always: explore first, file-level tasks, push to issue.

Target: ~1500 words.

- [ ] **Step 3: Commit**

```bash
git add plugins/process/skills/plan/SKILL.md
git commit -m "feat(process): add plan skill"
```

### Task 3: Execute skill

**Files:**
- Create: `plugins/process/skills/execute/SKILL.md`

**Reference:** Spec section "Skill: execute" + superpowers executing-plans and using-git-worktrees skills.

- [ ] **Step 1: Write SKILL.md frontmatter**

```yaml
---
name: execute
description: "Use when implementing an issue that has a checklist — creates a worktree, works through tasks, ticks checkboxes, and syncs to GitHub. Triggers on: 'work on issue N', 'implement issue N', 'execute issue N'."
---
```

- [ ] **Step 2: Write SKILL.md body**

The skill must include these sections in order:

1. **Title & overview** — "Execute" heading, announce text, core principle (per-item sync to GitHub preserves progress)
2. **Guard rail** — Check gh plugin, `issue_pull`, validate `in-progress` label and at least one unchecked item. If wrong state, redirect.
3. **The process** — numbered steps:
   - Parse checklist from issue body (find `- [ ]` items)
   - Create native Claude Code tasks from unchecked items
   - Check if worktree already exists for this issue
     - If not: `git worktree add ../worktree-issue-{number} -b issue-{number}` (or just checkout if branch exists)
     - If yes: use existing worktree
   - For each unchecked task in order:
     - Mark native task `in_progress`
     - Do the implementation work
     - Mark native task `completed`
     - Tick the checkbox in issue body (`- [ ]` → `- [x]`)
     - `issue_push` to sync to GitHub
   - When all items checked, tell user: "Run review next"
4. **Worktree conventions** — directory: `../worktree-issue-{number}`, branch: `issue-{number}`
5. **Resuming interrupted work** — if some items already checked, skip them and continue from first unchecked
6. **Common mistakes** — forgetting to sync after each item, working on main branch, not creating worktree
7. **Red flags** — Never: work on main, batch sync at end, skip items. Always: worktree, per-item sync, sequential order.

Target: ~1500 words.

- [ ] **Step 3: Commit**

```bash
git add plugins/process/skills/execute/SKILL.md
git commit -m "feat(process): add execute skill"
```

### Task 4: Review skill

**Files:**
- Create: `plugins/process/skills/review/SKILL.md`

**Reference:** Spec section "Skill: review" + superpowers finishing-a-development-branch skill.

- [ ] **Step 1: Write SKILL.md frontmatter**

```yaml
---
name: review
description: "Use when an issue's checklist is fully complete — verifies tests, creates a PR, and optionally merges. Triggers on: 'review issue N', 'PR for issue N', 'merge issue N'."
---
```

- [ ] **Step 2: Write SKILL.md body**

The skill must include these sections in order:

1. **Title & overview** — "Review" heading, announce text, core principle (PR with `Closes #N` handles issue closure)
2. **Guard rail** — Check gh plugin, `issue_pull`, validate `in-progress` label and ALL checklist items checked. If unchecked items remain, redirect to execute. If tests fail, redirect to execute.
3. **The process** — numbered steps:
   - Verify all checklist items are ticked
   - Run project test commands (look for test scripts in package.json, Makefile, etc.)
   - If tests fail: stop, tell user to run execute to fix
   - Create PR via `pr_create`:
     - Title: issue title
     - Body: `Closes #{number}\n\n## Summary\n{checklist items as bullet points}`
     - Head: `issue-{number}`
     - Base: `main`
   - Present options to user:
     - **Merge** — squash merge via `pr_merge`
     - **Keep PR open** — for external review
   - If merged: clean up worktree (`git worktree remove ../worktree-issue-{number}`)
   - Issue closes automatically via `Closes #N`
4. **Common mistakes** — forgetting test verification, hardcoding base branch, not cleaning up worktree
5. **Red flags** — Never: create PR without running tests, skip user choice on merge, manually close issue. Always: test first, user chooses merge timing, let `Closes #N` handle closure.

Target: ~1200 words.

- [ ] **Step 3: Commit**

```bash
git add plugins/process/skills/review/SKILL.md
git commit -m "feat(process): add review skill"
```

---

## Chunk 3: Integration

### Task 5: Marketplace + README + final verification

**Files:**
- Run: `scripts/generate-marketplace.sh`
- Modify: `.claude-plugin/marketplace.json` (set category)
- Modify: `plugins/process/README.md` (full content)

- [ ] **Step 1: Run marketplace generation**

```bash
./scripts/generate-marketplace.sh
```

Verify `plugins/process` appears in `.claude-plugin/marketplace.json`.

- [ ] **Step 2: Set category in marketplace.json**

Edit `.claude-plugin/marketplace.json` to set `"category": "development"` for the process plugin entry.

- [ ] **Step 3: Finalize README**

Update `plugins/process/README.md` with full documentation:
- Prerequisites (gh plugin installed)
- Label state machine diagram
- Skills table with triggers and transitions
- Usage examples for each phase
- Link to spec

- [ ] **Step 4: Check issue #120**

Read `plugins/gh/README.md` to verify `issue_pull`, `issue_push`, `issue_diff` are documented. If already documented (from recent commits), close #120. If not, add the documentation.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/marketplace.json plugins/process/README.md
git commit -m "feat(process): register in marketplace, finalize README

Refs #11, #120"
```

- [ ] **Step 6: Verify plugin structure**

```bash
# Check all expected files exist
ls -la plugins/process/.claude-plugin/plugin.json
ls -la plugins/process/LICENSE
ls -la plugins/process/README.md
ls -la plugins/process/skills/brainstorm/SKILL.md
ls -la plugins/process/skills/plan/SKILL.md
ls -la plugins/process/skills/execute/SKILL.md
ls -la plugins/process/skills/review/SKILL.md

# Verify marketplace.json is valid JSON
jq . .claude-plugin/marketplace.json

# Verify plugin.json is valid JSON
jq . plugins/process/.claude-plugin/plugin.json
```

---

## Final Checklist

- [ ] All 4 skills have SKILL.md with frontmatter (name, description)
- [ ] Each skill has guard rail checking gh plugin + issue state
- [ ] Each skill manages its label transition (or delegates to PR merge)
- [ ] Plugin registered in marketplace.json with category "development"
- [ ] README documents prerequisites, labels, skills, usage
- [ ] Issue #120 resolved (gh README updated or already current)
- [ ] All files committed
