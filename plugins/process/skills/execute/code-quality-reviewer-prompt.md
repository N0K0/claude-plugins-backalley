# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable).

**Only dispatch after spec compliance review passes.**

```
Agent tool (process:code-reviewer):
  description: "Review code quality for: [checklist item]"
  prompt: |
    Review the changes for: [what was implemented]

    Requirements: [checklist item from issue #{number}]
    Base SHA: [commit before task]
    Head SHA: [current commit]

    In addition to standard code quality concerns, check:
    - Does each file have one clear responsibility?
    - Are units decomposed so they can be understood and tested independently?
    - Did this change create new files that are already large, or significantly
      grow existing files?
    - Does the implementation follow existing codebase patterns?

    Return: Strengths, Issues (Critical/Important/Minor), Assessment
```
