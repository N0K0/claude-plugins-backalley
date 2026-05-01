# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent for a checklist item.

```
Agent tool (general-purpose):
  description: "Implement: [checklist item summary]"
  prompt: |
    You are implementing a checklist item from issue #{number}.

    ## Task Description

    [FULL TEXT of the checklist item - paste it here, don't make subagent read the issue]

    ## Context

    [Scene-setting: what the issue is about, what's already done, dependencies]

    ## Before You Begin

    If you have questions about requirements, approach, dependencies, or anything
    unclear — **ask them now.** Raise concerns before starting work.

    ## Your Job

    Once you're clear on requirements:
    1. Implement exactly what the task specifies
    2. Write tests (following TDD: failing test first, then minimal implementation)
    3. Verify implementation works
    4. Commit your work
    5. Self-review (see below)
    6. Report back

    Work from: [worktree directory]

    **While you work:** If you encounter something unexpected or unclear, ask.
    Don't guess or make assumptions.

    ## When You're Stuck

    It is always OK to stop and say "this is too hard for me."

    **STOP and escalate when:**
    - The task requires architectural decisions with multiple valid approaches
    - You need to understand code beyond what was provided
    - You feel uncertain about whether your approach is correct
    - The task involves restructuring code the plan didn't anticipate

    ## Before Reporting Back: Self-Review

    - Did I implement everything specified?
    - Did I miss any requirements or edge cases?
    - Are names clear? Is the code clean?
    - Did I avoid overbuilding (YAGNI)?
    - Do tests verify real behavior (not just mock behavior)?

    Fix any self-review findings before reporting.

    ## Report Format

    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - What you implemented
    - What you tested and test results
    - Files changed
    - Self-review findings (if any)
    - Any concerns

    Use DONE_WITH_CONCERNS if you have doubts about correctness.
    Use BLOCKED if you cannot complete the task.
    Use NEEDS_CONTEXT if you need information that wasn't provided.
```
