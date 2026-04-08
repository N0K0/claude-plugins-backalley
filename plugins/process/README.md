# process

GitHub Issues-driven development workflow — brainstorm, plan, execute, review — backed by skills, agents, and the gh plugin. Inspired by [superpowers](https://github.com/obra/superpowers), reimplemented on top of Claude Code native primitives with GitHub Issues as the single source of truth for workflow state.

## Install
```
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install process@claude-plugins-backalley
```

## Components

### Skills

The four core workflow skills move an issue through `needs-spec → has-spec → in-progress → closed`:

- **brainstorm** — turn an issue with `needs-spec` into a spec via guided Q&A.
  Trigger: "brainstorm issue 42" → walks you through problem, approaches, and acceptance criteria, then writes the spec to the issue body.
- **plan** — break the spec into a file-level implementation checklist appended to the issue.
  Trigger: "plan issue 42" → explores the codebase and adds `- [ ]` tasks under `## Implementation Checklist`.
- **execute** — work through the checklist in a `../worktree-issue-N` worktree, syncing progress to GitHub after each item.
  Trigger: "work on issue 42" → resumable from the first unchecked item.
- **review** — run final checks, open a PR with `Closes #N`, and offer to merge.
  Trigger: "review issue 42" → cleans up the worktree after merge.

Supporting skills used by the workflow (and directly invocable):

- **tdd** — enforces red-green-refactor when writing implementation code.
  Trigger: triggered automatically by `execute`, or "use TDD for this fix".
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

### Agents

- **code-reviewer** — independent reviewer used by `review` and `execute` to check completed work against the spec and coding standards.
  Example: `Agent({ subagent_type: "process:code-reviewer", prompt: "Review the diff on issue-42 against the spec in #42" })`.

## Requirements

- **gh plugin** from this marketplace (provides `detect_repo`, `issue_pull`, `issue_push`, `pr_create`, `pr_merge`, etc.)
- **`gh` CLI** installed and authenticated (required by the gh plugin)
- **git** with worktree support

## License

[LICENSE](LICENSE)
