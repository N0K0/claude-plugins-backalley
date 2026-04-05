# process Plugin

GitHub Issues-driven development workflow with four skills: brainstorm, plan, execute, review. Heavily inspired by [superpowers](https://github.com/obra/superpowers), reimplemented with Claude Code native features (skills, agents, hooks, tasks) and a GitHub Issues layer for state management.

## Prerequisites

- **gh plugin** must be installed from the backalley marketplace (provides `detect_repo`, `issue_pull`, `issue_push`, `issue_update`, `pr_create`, `pr_merge`)
- **gh CLI** must be installed and authenticated (required by the gh plugin)
- **git** with worktree support

## Label State Machine
```
backlog + needs-spec  →  brainstorm  →  backlog + has-spec
backlog + has-spec    →  plan        →  in-progress
in-progress           →  execute     →  in-progress (checklist items ticked)
in-progress (all done)→  review      →  closed (via PR merge + Closes #N)
```

Labels managed by the plugin: `needs-spec`, `has-spec`, `in-progress`, `backlog`.

## Skills

| Skill      | Triggers                                 | Entry State                       | Exit State             |
| ---------- | ---------------------------------------- | --------------------------------- | ---------------------- |
| brainstorm | "brainstorm issue N", "spec out issue N" | `needs-spec`                      | `has-spec`             |
| plan       | "plan issue N", "break down issue N"     | `has-spec`                        | `in-progress`          |
| execute    | "work on issue N", "implement issue N"   | `in-progress` + unchecked items   | checklist items ticked |
| review     | "review issue N", "PR for issue N"       | `in-progress` + all items checked | closed (via PR)        |

### brainstorm

Takes an issue with `needs-spec` and writes a spec into the issue body through guided Q&A. Asks one question at a time, proposes 2-3 approaches, gets section-by-section approval.

### plan

Reads the spec from the issue body, explores the codebase, and appends an implementation checklist (`- [ ]` items) to the issue.

### execute

Creates a git worktree (`../worktree-issue-{number}` on branch `issue-{number}`), works through checklist items sequentially, and syncs progress to GitHub after each item. Resumable — picks up from the first unchecked item.

### review

Verifies tests pass, creates a PR with `Closes #{number}`, and offers merge or keep-open. Cleans up the worktree after merge.

## Usage
```
# Start with an issue that has the needs-spec label
"brainstorm issue 42"

# Once spec is written, create the checklist
"plan issue 42"

# Implement the checklist items
"work on issue 42"

# Create PR and merge
"review issue 42"
```

## Design

GitHub Issues are the single source of truth. No local spec files, no local plan files. The issue body holds the spec and the implementation checklist. Labels encode workflow state. Each skill validates the issue is in the correct state before proceeding.
