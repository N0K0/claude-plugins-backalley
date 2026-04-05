---
name: tdd
description: "Enforces test-driven development (red-green-refactor) when implementing features or fixing bugs. Triggers before writing implementation code."
---
# Test-Driven Development (TDD)

## Overview

Write the test first. Watch it fail. Write minimal code to pass.

**Core principle:** If you didn't watch the test fail, you don't know if it tests the right thing.

## When to Use

**Always:**
- New features
- Bug fixes
- Refactoring
- Behavior changes

**Exceptions (confirm with the user first):**
- Throwaway prototypes
- Generated code
- Configuration files

## Core Rule

**Write the failing test before implementation code.**

Write code before the test? Start over with the test.

## Red-Green-Refactor
```
RED (write failing test) → verify it fails → GREEN (minimal code) → verify it passes → REFACTOR (clean up) → repeat
```

### RED - Write Failing Test

Write one minimal test showing what should happen.

<Good>

```typescript
test('retries failed operations 3 times', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

Clear name, tests real behavior, one thing
</Good>

<Bad>

```typescript
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```

Vague name, tests mock not code
</Bad>

**Requirements:**
- One behavior
- Clear name
- Real code (no mocks unless unavoidable)

### Verify RED - Watch It Fail

Do not skip this step.

```bash
npm test path/to/test.test.ts
```

Confirm:
- Test fails (not errors)
- Failure message is expected
- Fails because feature missing (not typos)

**Test passes?** You're testing existing behavior. Fix test.

**Test errors?** Fix error, re-run until it fails correctly.

### GREEN - Minimal Code

Write simplest code to pass the test.

<Good>

```typescript
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```

Just enough to pass
</Good>

<Bad>

```typescript
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number) => void;
  }
): Promise<T> {
  // YAGNI
}
```

Over-engineered
</Bad>

Don't add features, refactor other code, or "improve" beyond the test.

### Verify GREEN - Watch It Pass

Do not skip this step.

```bash
npm test path/to/test.test.ts
```

Confirm:
- Test passes
- Other tests still pass
- Output pristine (no errors, warnings)

**Test fails?** Fix code, not test.

**Other tests fail?** Fix now.

### REFACTOR - Clean Up

After green only:
- Remove duplication
- Improve names
- Extract helpers

Keep tests green. Don't add behavior.

### Repeat

Next failing test for next feature.

## Good Tests

| Quality          | Good                                | Bad                                                 |
| ---------------- | ----------------------------------- | --------------------------------------------------- |
| **Minimal**      | One thing. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| **Clear**        | Name describes behavior             | `test('test1')`                                     |
| **Shows intent** | Demonstrates desired API            | Obscures what code should do                        |

## Red Flags

If you notice any of these, stop and revisit the TDD cycle:

- **Code written before test** — tests-after are biased by implementation and prove less.
- **Test passes immediately** — you are testing existing behavior, not driving new behavior.
- **"I'll test after"** — tests-first answer "what should this do?", tests-after answer "what does this do?"
- **"Already manually tested"** — manual testing is ad-hoc, not reproducible, and misses edge cases.
- **"Too simple to test"** — simple code breaks too. A test takes 30 seconds.
- **"Deleting X hours is wasteful"** — sunk cost fallacy. Keeping unverified code is technical debt.
- **"Keep as reference"** — you will adapt it instead of writing fresh from tests. Start clean.
- **"Need to explore first"** — fine, but throw away the exploration and start with TDD.
- **"Test is hard to write"** — hard to test often means hard to use. Simplify the design.
- **"TDD will slow me down"** — TDD is faster than debugging. The shortcut leads to production bugs.
- **"Existing code has no tests"** — you are improving it now. Add tests for what you change.

## Example: Bug Fix

**Bug:** Empty email accepted

**RED**

```typescript
test('rejects empty email', async () => {
  const result = await submitForm({ email: '' });
  expect(result.error).toBe('Email required');
});
```

**Verify RED**

```bash
$ npm test
FAIL: expected 'Email required', got undefined
```

**GREEN**

```typescript
function submitForm(data: FormData) {
  if (!data.email?.trim()) {
    return { error: 'Email required' };
  }
  // ...
}
```

**Verify GREEN**

```bash
$ npm test
PASS
```

**REFACTOR**
Extract validation for multiple fields if needed.

## Verification Checklist

Before marking work complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered

If any boxes are unchecked, revisit the missed steps.

## When Stuck

| Problem                | Solution                                                   |
| ---------------------- | ---------------------------------------------------------- |
| Don't know how to test | Write wished-for API. Write assertion first. Ask for help. |
| Test too complicated   | Design too complicated. Simplify interface.                |
| Must mock everything   | Code too coupled. Use dependency injection.                |
| Test setup huge        | Extract helpers. Still complex? Simplify design.           |

## Debugging Integration

Bug found? Write failing test reproducing it. Follow TDD cycle. Test proves fix and prevents regression.

Never fix bugs without a test.

## Final Rule

**Production code requires a test that existed and failed first. Exceptions require explicit user permission.**
