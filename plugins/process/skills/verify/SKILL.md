---
name: verify
description: "Requires running verification commands and confirming output before making success claims. Triggers before committing, creating PRs, or claiming work is complete."
---
# Verification Before Completion

## Overview

Always verify before claiming completion.

**Core principle:** Evidence before claims, always.

**Completion claims require fresh verification evidence.**

If you haven't run the verification command in this message, you cannot claim it passes.

## The Gate Function
```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skipping steps invalidates the verification.
```

## Common Failures

| Claim                 | Requires                        | Not Sufficient                 |
| --------------------- | ------------------------------- | ------------------------------ |
| Tests pass            | Test command output: 0 failures | Previous run, "should pass"    |
| Linter clean          | Linter output: 0 errors         | Partial check, extrapolation   |
| Build succeeds        | Build command: exit 0           | Linter passing, logs look good |
| Bug fixed             | Test original symptom: passes   | Code changed, assumed fixed    |
| Regression test works | Red-green cycle verified        | Test passes once               |
| Agent completed       | VCS diff shows changes          | Agent reports "success"        |
| Requirements met      | Line-by-line checklist          | Tests passing                  |

## Red Flags and Rationalizations

Watch for these patterns that indicate verification is being skipped:

- Using "should", "probably", "seems to" instead of evidence
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports without independent checks
- Relying on partial verification or extrapolation
- Thinking "just this once" -- no exceptions

| Excuse                    | Reality                    |
| ------------------------- | -------------------------- |
| "Should work now"         | Run the verification       |
| "I'm confident"           | Confidence is not evidence |
| "Just this once"          | No exceptions              |
| "Linter passed"           | Linter is not compiler     |
| "Agent said success"      | Verify independently       |
| "Partial check is enough" | Partial proves nothing     |

## Key Patterns

**Tests:**

```
Correct:   [Run test command] [See: 34/34 pass] "All tests pass"
Incorrect: "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**

```
Correct:   Write -> Run (pass) -> Revert fix -> Run (MUST FAIL) -> Restore -> Run (pass)
Incorrect: "I've written a regression test" (without red-green verification)
```

**Build:**

```
Correct:   [Run build] [See: exit 0] "Build passes"
Incorrect: "Linter passed" (linter doesn't check compilation)
```

**Requirements:**

```
Correct:   Re-read plan -> Create checklist -> Verify each -> Report gaps or completion
Incorrect: "Tests pass, phase complete"
```

**Agent delegation:**

```
Correct:   Agent reports success -> Check VCS diff -> Verify changes -> Report actual state
Incorrect: Trust agent report
```

## Why This Matters

False completion claims waste time through:
- Redirect and rework cycles
- Broken trust in status reports
- Undefined functions or missing requirements shipping
- Time spent debugging issues that "were already fixed"

## When To Apply

**Apply before:**
- Variations of success or completion claims
- Expressions of satisfaction
- Positive statements about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- Communication suggesting completion or correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. Then claim the result.
