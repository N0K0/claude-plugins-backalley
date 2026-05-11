# process

GitHub Issues-driven development workflow — spec-issue, plan-issue, execute-issue, finish-issue — backed by skills, agents, and the gh plugin. Inspired by [superpowers](https://github.com/obra/superpowers), reimplemented on top of Claude Code native primitives with GitHub Issues as the single source of truth for workflow state.

## Install
```
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install process@claude-plugins-backalley
```

## Components

### Skills

The four core workflow skills move an issue through `needs-spec → has-spec → in-progress → closed`:

- **spec-issue** — turn an issue with `needs-spec` into a spec via guided Q&A.
  Trigger: "spec issue 42" / "brainstorm issue 42" → walks you through problem, approaches, and acceptance criteria, then writes the spec to the issue body.
- **plan-issue** — break the spec into a file-level implementation checklist appended to the issue.
  Trigger: "plan issue 42" → explores the codebase and adds `- [ ]` tasks under `## Implementation Checklist`.
- **execute-issue** — work through the checklist in a `../worktree-issue-N` worktree, syncing progress to GitHub after each item. Writes a plan-only working file (`.issues/issue-N.plan.md`) at start so the implementation loop loads only the checklist, not the full spec.
  Trigger: "work on issue 42" / "implement issue 42" → resumable from the first unchecked item.
- **finish-issue** — run final checks, open a PR with `Closes #N`, and offer to merge.
  Trigger: "finish issue 42" / "review issue 42" → cleans up the worktree after merge.

Supporting skills used by the workflow (and directly invocable):

- **tdd** — enforces red-green-refactor when writing implementation code.
  Trigger: triggered automatically by `execute-issue`, or "use TDD for this fix".
- **debugging** — guides systematic root-cause investigation before proposing a fix.
  Trigger: "the test is failing, debug it" → forces hypothesis/evidence loop.
- **verify** — requires running a verification command and reading output before claiming success.
  Trigger: "verify the build" → blocks "should pass" claims without evidence.
- **receiving-review** — evaluate code review feedback technically before acting on it.
  Trigger: "I got review comments on PR 50" → triages each comment.
- **lint-issues** — audit the open issue list for label/spec/checklist consistency.
  Trigger: "lint issues" → reports label drift, missing specs, stale checklists.
- **parallel-agents** — dispatch independent tasks to parallel subagents with shared-state safety checks.
  Trigger: "research these three things in parallel" → fans out one subagent per task.

General-purpose skills (ported from superpowers, not bound to the issue workflow):

- **worktree** — create an isolated git worktree with directory-priority selection and gitignore safety verification.
  Trigger: "set up a worktree for this feature" → picks `.worktrees/` (verifies ignored), runs project setup, confirms clean test baseline.
- **subagents** — execute an implementation plan by dispatching a fresh implementer subagent per task with two-stage review (spec compliance, then code quality).
  Trigger: "dispatch implementation as subagents" → handles status reporting, model selection, and review loops.
- **request-review** — dispatch the `code-reviewer` agent with precisely crafted context (git SHAs, plan reference, description) instead of session history.
  Trigger: "request a code review on this work" → fills the `code-reviewer.md` template.
- **write-skill** — author and verify new skills using TDD-for-documentation (pressure scenarios, rationalization tables).
  Trigger: "I want to write a new skill" → walks through RED/GREEN/REFACTOR for skill text.

### Agents

- **code-reviewer** — independent reviewer used by `finish-issue` and `execute-issue` to check completed work against the spec and coding standards.
  Example: `Agent({ subagent_type: "process:code-reviewer", prompt: "Review the diff on issue-42 against the spec in #42" })`.

## Requirements

- **gh plugin** from this marketplace (provides `detect_repo`, `issue_pull`, `issue_push`, `pr_create`, `pr_merge`, etc.)
- **`gh` CLI** installed and authenticated (required by the gh plugin)
- **git** with worktree support

## License

[LICENSE](LICENSE)
