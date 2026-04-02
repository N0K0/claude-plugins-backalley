# GH Auto-Sync Hooks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SessionStart auto-pull and Stop auto-push hooks that keep `.issues/` files in sync with GitHub, plus new-issue creation from `issue-new*.md` files and a skill to teach Claude the workflow.

**Architecture:** Thin bash hook wrappers invoke Bun scripts that reuse existing TypeScript modules (`issue-files.ts`, `gh.ts`). A new `src/hooks/shared.ts` provides project-root discovery and file scanning. Existing types and parsers are relaxed to support files without a `number` field.

**Tech Stack:** Bun, TypeScript, bash, `gh` CLI, `yaml` package (existing dependency)

**Spec:** `docs/superpowers/specs/2026-04-02-gh-auto-sync-hooks-design.md`

---

## Chunk 1: Foundation — Type changes, shared helpers, tests

### Task 1: Relax `IssueFrontmatter` and `parseIssueFile()` for new-issue files

**Files:**
- Modify: `plugins/gh/src/tools/issue-files.ts:6-68`

- [ ] **Step 1: Write test for parsing a new-issue file (no number/url/pulled_at)**

Create `plugins/gh/src/tools/issue-files.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { parseIssueFile, serializeIssue, resolveIssuePaths } from './issue-files';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

describe('parseIssueFile', () => {
  test('parses standard issue file with number', () => {
    const content = `---
number: 42
title: "Test issue"
state: open
labels:
  - bug
milestone: null
assignees: []
url: "https://github.com/owner/repo/issues/42"
pulled_at: "2026-04-01T00:00:00.000Z"
---

Body content here`;
    const result = parseIssueFile(content);
    expect(result.frontmatter.number).toBe(42);
    expect(result.frontmatter.title).toBe('Test issue');
    expect(result.body).toBe('Body content here');
  });

  test('parses new-issue file without number, url, pulled_at', () => {
    const content = `---
title: "New feature request"
state: open
labels:
  - enhancement
milestone: 2
assignees:
  - alice
---

This is a new issue body.`;
    const result = parseIssueFile(content);
    expect(result.frontmatter.number).toBeUndefined();
    expect(result.frontmatter.url).toBeUndefined();
    expect(result.frontmatter.pulled_at).toBeUndefined();
    expect(result.frontmatter.title).toBe('New feature request');
    expect(result.frontmatter.labels).toEqual(['enhancement']);
    expect(result.frontmatter.milestone).toBe(2);
    expect(result.frontmatter.assignees).toEqual(['alice']);
    expect(result.body).toBe('This is a new issue body.');
  });

  test('throws on missing YAML frontmatter delimiters', () => {
    expect(() => parseIssueFile('no frontmatter')).toThrow('missing YAML frontmatter delimiters');
  });

  test('throws on missing title', () => {
    const content = `---
state: open
labels: []
---

Body`;
    expect(() => parseIssueFile(content)).toThrow('missing "title"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: FAIL — "parses new-issue file" fails because `parseIssueFile` throws on missing `number`

- [ ] **Step 3: Update `IssueFrontmatter` type and `parseIssueFile()`**

In `plugins/gh/src/tools/issue-files.ts`, make `number`, `url`, `pulled_at` optional in the interface, remove the `number` check, and add a `title` check:

```typescript
/** Frontmatter fields stored in issue markdown files */
export interface IssueFrontmatter {
  number?: number;
  title: string;
  state: string;
  labels: string[];
  milestone: number | null;
  assignees: string[];
  url?: string;
  pulled_at?: string;
}
```

Update `parseIssueFile()` — replace the `number` validation with `title` validation:

```typescript
export function parseIssueFile(content: string): ParsedIssueFile {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid issue file: missing YAML frontmatter delimiters');
  }

  const frontmatter = parse(match[1]) as IssueFrontmatter;
  if (typeof frontmatter.title !== 'string' || !frontmatter.title) {
    throw new Error('Invalid issue file: missing "title" in frontmatter');
  }

  // Trim trailing newline added by serializeIssue
  const body = match[2].replace(/\n$/, '');

  return { frontmatter, body };
}
```

- [ ] **Step 4: Fix callers that assume `number` is defined**

In `plugins/gh/src/tools/issues.ts`, the `issue_push` handler at line 222 accesses `frontmatter.number` without checking. Add a guard at the top of the push loop body (this is prep for Task 4 which adds create logic):

```typescript
// Inside the issue_push handler loop, after parseIssueFile:
const { frontmatter, body } = parseIssueFile(content);

if (frontmatter.number === undefined) {
  errors.push({
    file: filePath.split('/').pop(),
    error: 'Skipped: new-issue file (no number). Not yet pushed to GitHub.',
  });
  continue;
}
```

Similarly in `issue_diff` handler at line 269, add the same guard:

```typescript
const { frontmatter, body } = parseIssueFile(content);

if (frontmatter.number === undefined) {
  errors.push({
    file: filePath.split('/').pop(),
    error: 'Skipped: new-issue file has no number (not yet pushed to GitHub)',
  });
  continue;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add plugins/gh/src/tools/issue-files.ts plugins/gh/src/tools/issue-files.test.ts plugins/gh/src/tools/issues.ts
git commit -m "feat(gh): make IssueFrontmatter.number optional for new-issue files"
```

---

### Task 2: Update `resolveIssuePaths()` to include `issue-new*.md` files

**Files:**
- Modify: `plugins/gh/src/tools/issue-files.ts:208-223`
- Modify: `plugins/gh/src/tools/issue-files.test.ts`

- [ ] **Step 1: Write test for resolveIssuePaths including new-issue files**

Append to `plugins/gh/src/tools/issue-files.test.ts`:

```typescript
describe('resolveIssuePaths', () => {
  const tmpDir = join(import.meta.dir, '__test_tmp_resolve');

  test('includes both numbered and new-issue files from directory', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), '---\ntitle: "One"\n---\n\n');
    await writeFile(join(tmpDir, 'issue-10.md'), '---\ntitle: "Ten"\n---\n\n');
    await writeFile(join(tmpDir, 'issue-new.md'), '---\ntitle: "New"\n---\n\n');
    await writeFile(join(tmpDir, 'issue-new-auth.md'), '---\ntitle: "Auth"\n---\n\n');
    await writeFile(join(tmpDir, 'README.md'), 'ignore me');

    const paths = await resolveIssuePaths(tmpDir);
    const names = paths.map(p => p.split('/').pop());

    // Numbered files sorted by number, then new-issue files sorted alphabetically
    expect(names).toEqual([
      'issue-1.md',
      'issue-10.md',
      'issue-new-auth.md',
      'issue-new.md',
    ]);

    await rm(tmpDir, { recursive: true });
  });

  test('returns single file path when given a file', async () => {
    await mkdir(tmpDir, { recursive: true });
    const f = join(tmpDir, 'issue-5.md');
    await writeFile(f, '---\ntitle: "Five"\n---\n\n');
    const paths = await resolveIssuePaths(f);
    expect(paths).toEqual([f]);
    await rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: FAIL — "includes both numbered and new-issue files" fails because `issue-new*.md` files are excluded by the regex

- [ ] **Step 3: Update `resolveIssuePaths()` to match new-issue files**

In `plugins/gh/src/tools/issue-files.ts`, replace the `resolveIssuePaths` function:

```typescript
export async function resolveIssuePaths(path: string): Promise<string[]> {
  const s = await stat(path);
  if (s.isFile()) return [path];
  if (s.isDirectory()) {
    const entries = await readdir(path);
    const numbered = entries
      .filter(e => /^issue-\d+\.md$/.test(e))
      .sort((a, b) => {
        const numA = parseInt(a.match(/issue-(\d+)/)?.[1] ?? '0');
        const numB = parseInt(b.match(/issue-(\d+)/)?.[1] ?? '0');
        return numA - numB;
      });
    const newIssues = entries
      .filter(e => /^issue-new.*\.md$/.test(e))
      .sort();
    return [...numbered, ...newIssues].map(e => join(path, e));
  }
  throw new Error(`Path is neither a file nor directory: ${path}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/gh/src/tools/issue-files.ts plugins/gh/src/tools/issue-files.test.ts
git commit -m "feat(gh): include issue-new*.md files in resolveIssuePaths"
```

---

### Task 3: Create `src/hooks/shared.ts` with project-root and file-scanning helpers

**Files:**
- Create: `plugins/gh/src/hooks/shared.ts`
- Create: `plugins/gh/src/hooks/shared.test.ts`

- [ ] **Step 1: Write tests for shared helpers**

Create `plugins/gh/src/hooks/shared.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { findProjectRoot, findIssueFiles, isModifiedSince } from './shared';
import { mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

describe('findProjectRoot', () => {
  test('finds .git in ancestor directory', () => {
    // We're inside the repo, so this should work
    const root = findProjectRoot(import.meta.dir);
    expect(root).toBeTruthy();
    expect(existsSync(join(root!, '.git'))).toBe(true);
  });

  test('returns null for non-git directory', () => {
    const root = findProjectRoot('/tmp');
    expect(root).toBeNull();
  });
});

describe('findIssueFiles', () => {
  const tmpDir = join(import.meta.dir, '__test_tmp_hooks');

  test('finds numbered and new-issue files', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), 'test');
    await writeFile(join(tmpDir, 'issue-new.md'), 'test');
    await writeFile(join(tmpDir, 'issue-new-bug.md'), 'test');
    await writeFile(join(tmpDir, 'README.md'), 'ignore');

    const files = await findIssueFiles(tmpDir);
    expect(files.numbered.map(f => f.name)).toEqual(['issue-1.md']);
    expect(files.numbered[0].number).toBe(1);
    expect(files.newIssues.map(f => f.name).sort()).toEqual(['issue-new-bug.md', 'issue-new.md']);

    await rm(tmpDir, { recursive: true });
  });

  test('returns empty arrays when directory is empty', async () => {
    await mkdir(tmpDir, { recursive: true });
    const files = await findIssueFiles(tmpDir);
    expect(files.numbered).toEqual([]);
    expect(files.newIssues).toEqual([]);
    await rm(tmpDir, { recursive: true });
  });
});

describe('isModifiedSince', () => {
  const tmpDir = join(import.meta.dir, '__test_tmp_mtime');

  test('returns true when file mtime is after pulled_at', async () => {
    await mkdir(tmpDir, { recursive: true });
    const f = join(tmpDir, 'test.md');
    await writeFile(f, 'content');
    // Set pulled_at to 1 hour ago
    const pastDate = new Date(Date.now() - 3600_000).toISOString();
    expect(await isModifiedSince(f, pastDate)).toBe(true);
    await rm(tmpDir, { recursive: true });
  });

  test('returns false when file mtime is before pulled_at', async () => {
    await mkdir(tmpDir, { recursive: true });
    const f = join(tmpDir, 'test.md');
    await writeFile(f, 'content');
    // Set file mtime to 1 hour ago
    const past = new Date(Date.now() - 3600_000);
    await utimes(f, past, past);
    // pulled_at is now (after the mtime)
    const now = new Date().toISOString();
    expect(await isModifiedSince(f, now)).toBe(false);
    await rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/gh && bun test src/hooks/shared.test.ts`
Expected: FAIL — module `./shared` not found

- [ ] **Step 3: Implement `shared.ts`**

Create `plugins/gh/src/hooks/shared.ts`:

```typescript
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

export interface NumberedIssueFile {
  name: string;
  path: string;
  number: number;
}

export interface NewIssueFile {
  name: string;
  path: string;
}

export interface IssueFileSet {
  numbered: NumberedIssueFile[];
  newIssues: NewIssueFile[];
}

/**
 * Walk up from cwd to find the nearest directory containing .git.
 * Returns the directory path, or null if none found.
 */
export function findProjectRoot(from: string): string | null {
  let dir = from;
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/**
 * Scan a directory for issue files, returning them categorized.
 * Numbered files (issue-{N}.md) are sorted by number.
 * New-issue files (issue-new*.md) are sorted alphabetically.
 */
export async function findIssueFiles(dir: string): Promise<IssueFileSet> {
  const entries = await readdir(dir);

  const numbered: NumberedIssueFile[] = [];
  const newIssues: NewIssueFile[] = [];

  for (const name of entries) {
    const numMatch = name.match(/^issue-(\d+)\.md$/);
    if (numMatch) {
      numbered.push({ name, path: join(dir, name), number: parseInt(numMatch[1]) });
      continue;
    }
    if (/^issue-new.*\.md$/.test(name)) {
      newIssues.push({ name, path: join(dir, name) });
    }
  }

  numbered.sort((a, b) => a.number - b.number);
  newIssues.sort((a, b) => a.name.localeCompare(b.name));

  return { numbered, newIssues };
}

/**
 * Check if a file has been modified since a given ISO timestamp.
 * Compares file mtime against the provided date string.
 */
export async function isModifiedSince(filePath: string, pulledAt: string): Promise<boolean> {
  const s = await stat(filePath);
  return s.mtimeMs > new Date(pulledAt).getTime();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/hooks/shared.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/gh/src/hooks/shared.ts plugins/gh/src/hooks/shared.test.ts
git commit -m "feat(gh): add shared hook helpers (findProjectRoot, findIssueFiles, isModifiedSince)"
```

---

## Chunk 2: Hook scripts — pull and push

### Task 4: Implement `pull-existing.ts` (SessionStart hook)

**Files:**
- Create: `plugins/gh/src/hooks/pull-existing.ts`
- Create: `plugins/gh/src/hooks/pull-existing.test.ts`

- [ ] **Step 1: Write test for pull-existing logic**

The full hook calls `gh api` which we can't easily test without mocks. Write a focused unit test for the core logic extracted into a testable function. Create `plugins/gh/src/hooks/pull-existing.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { buildPullResult } from './pull-existing';

describe('buildPullResult', () => {
  test('formats summary with count', () => {
    const result = buildPullResult({ pulled: 3, warnings: [] });
    expect(result.status).toBe('ok');
    expect(result.summary).toContain('3');
  });

  test('includes warnings in output', () => {
    const result = buildPullResult({ pulled: 1, warnings: ['Issue #5: not found'] });
    expect(result.warnings).toEqual(['Issue #5: not found']);
  });

  test('formats empty pull', () => {
    const result = buildPullResult({ pulled: 0, warnings: [] });
    expect(result.status).toBe('ok');
    expect(result.summary).toContain('0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/gh && bun test src/hooks/pull-existing.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `pull-existing.ts`**

Create `plugins/gh/src/hooks/pull-existing.ts`:

```typescript
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot, findIssueFiles } from './shared.js';
import { detectRepo, api } from '../gh.js';
import { serializeIssue } from '../tools/issue-files.js';

interface PullStats {
  pulled: number;
  warnings: string[];
}

interface HookResult {
  status: string;
  summary: string;
  warnings?: string[];
}

export function buildPullResult(stats: PullStats): HookResult {
  const result: HookResult = {
    status: 'ok',
    summary: `Pulled ${stats.pulled} issue${stats.pulled !== 1 ? 's' : ''}.`,
  };
  if (stats.warnings.length > 0) {
    result.warnings = stats.warnings;
  }
  return result;
}

async function main() {
  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.log(JSON.stringify({}));
    return;
  }

  const issuesDir = join(root, '.issues');
  if (!existsSync(issuesDir)) {
    console.log(JSON.stringify({}));
    return;
  }

  let ctx;
  try {
    ctx = await detectRepo(root);
  } catch {
    console.log(JSON.stringify({}));
    return;
  }

  const { numbered } = await findIssueFiles(issuesDir);
  if (numbered.length === 0) {
    console.log(JSON.stringify(buildPullResult({ pulled: 0, warnings: [] })));
    return;
  }

  const stats: PullStats = { pulled: 0, warnings: [] };

  for (const file of numbered) {
    try {
      const issue = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${file.number}`);
      if (issue.pull_request) {
        stats.warnings.push(`#${file.number}: is a pull request, skipped`);
        continue;
      }
      const content = serializeIssue(issue);
      await Bun.write(file.path, content);
      stats.pulled++;
    } catch (err: any) {
      stats.warnings.push(`#${file.number}: ${err.message}`);
    }
  }

  console.log(JSON.stringify(buildPullResult(stats)));
}

main().catch((err) => {
  console.log(JSON.stringify({ status: 'error', summary: err.message }));
  process.exit(1);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/hooks/pull-existing.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/gh/src/hooks/pull-existing.ts plugins/gh/src/hooks/pull-existing.test.ts
git commit -m "feat(gh): implement SessionStart pull-existing hook script"
```

---

### Task 5: Implement `push-changed.ts` (Stop hook)

**Files:**
- Create: `plugins/gh/src/hooks/push-changed.ts`
- Create: `plugins/gh/src/hooks/push-changed.test.ts`

- [ ] **Step 1: Write test for push result formatting and conflict detection helpers**

Create `plugins/gh/src/hooks/push-changed.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { buildPushResult, isRemoteNewer } from './push-changed';

describe('buildPushResult', () => {
  test('formats summary with all counts', () => {
    const result = buildPushResult({ pushed: 2, created: 1, skipped: ['#42 (remote newer)'] });
    expect(result.status).toBe('ok');
    expect(result.summary).toContain('2');
    expect(result.summary).toContain('1');
    expect(result.summary).toContain('#42');
  });

  test('omits zero counts from summary', () => {
    const result = buildPushResult({ pushed: 1, created: 0, skipped: [] });
    expect(result.status).toBe('ok');
    expect(result.warnings).toBeUndefined();
  });
});

describe('isRemoteNewer', () => {
  test('returns true when remote updated after pulled_at', () => {
    expect(isRemoteNewer('2026-04-01T12:00:00Z', '2026-04-01T10:00:00Z')).toBe(true);
  });

  test('returns false when remote updated before pulled_at', () => {
    expect(isRemoteNewer('2026-04-01T08:00:00Z', '2026-04-01T10:00:00Z')).toBe(false);
  });

  test('returns true when pulled_at is undefined (no baseline)', () => {
    expect(isRemoteNewer('2026-04-01T12:00:00Z', undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/gh && bun test src/hooks/push-changed.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `push-changed.ts`**

Create `plugins/gh/src/hooks/push-changed.ts`:

```typescript
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { rename } from 'node:fs/promises';
import { findProjectRoot, findIssueFiles, isModifiedSince } from './shared.js';
import { detectRepo, api } from '../gh.js';
import { parseIssueFile, serializeIssue } from '../tools/issue-files.js';

interface PushStats {
  pushed: number;
  created: number;
  skipped: string[];
}

interface HookResult {
  status: string;
  summary: string;
  warnings?: string[];
}

export function isRemoteNewer(remoteUpdatedAt: string, pulledAt: string | undefined): boolean {
  if (!pulledAt) return true; // No baseline — treat as conflict to be safe
  return new Date(remoteUpdatedAt) > new Date(pulledAt);
}

export function buildPushResult(stats: PushStats): HookResult {
  const parts: string[] = [];
  if (stats.pushed > 0) parts.push(`Pushed ${stats.pushed}`);
  if (stats.created > 0) parts.push(`created ${stats.created}`);
  if (stats.skipped.length > 0) parts.push(`skipped ${stats.skipped.join(', ')}`);

  const result: HookResult = {
    status: 'ok',
    summary: parts.length > 0 ? parts.join(', ') + '.' : 'No changes to push.',
  };
  if (stats.skipped.length > 0) {
    result.warnings = stats.skipped.map(s => `${s}: remote has changes since last pull. Run issue_diff to inspect.`);
  }
  return result;
}

async function main() {
  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.log(JSON.stringify({}));
    return;
  }

  const issuesDir = join(root, '.issues');
  if (!existsSync(issuesDir)) {
    console.log(JSON.stringify({}));
    return;
  }

  let ctx;
  try {
    ctx = await detectRepo(root);
  } catch {
    console.log(JSON.stringify({}));
    return;
  }

  const { numbered, newIssues } = await findIssueFiles(issuesDir);
  const stats: PushStats = { pushed: 0, created: 0, skipped: [] };

  // Push modified existing issues
  for (const file of numbered) {
    try {
      const content = await Bun.file(file.path).text();
      const { frontmatter, body } = parseIssueFile(content);

      if (!frontmatter.number) continue; // safety check

      // Skip if not modified since last pull
      if (frontmatter.pulled_at && !(await isModifiedSince(file.path, frontmatter.pulled_at))) {
        continue;
      }

      // Conflict check: fetch remote state
      const remote = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`);
      if (isRemoteNewer(remote.updated_at, frontmatter.pulled_at)) {
        stats.skipped.push(`#${frontmatter.number} (remote newer)`);
        continue;
      }

      // Push changes — PATCH response returns the full updated issue
      const updated = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`, {
        method: 'PATCH',
        body: {
          title: frontmatter.title,
          state: frontmatter.state,
          labels: frontmatter.labels,
          milestone: frontmatter.milestone,
          assignees: frontmatter.assignees,
          body,
        },
      });

      // Rewrite file with updated pulled_at (resets mtime)
      const refreshed = serializeIssue(updated);
      await Bun.write(file.path, refreshed);
      stats.pushed++;
    } catch (err: any) {
      stats.skipped.push(`#${file.number} (${err.message})`);
    }
  }

  // Create new issues
  for (const file of newIssues) {
    try {
      const content = await Bun.file(file.path).text();
      const { frontmatter, body } = parseIssueFile(content);

      if (!frontmatter.title) {
        stats.skipped.push(`${file.name} (missing title)`);
        continue;
      }

      const createBody: Record<string, unknown> = { title: frontmatter.title, body };
      if (frontmatter.labels?.length) createBody.labels = frontmatter.labels;
      if (frontmatter.milestone) createBody.milestone = frontmatter.milestone;
      if (frontmatter.assignees?.length) createBody.assignees = frontmatter.assignees;

      const created = await api(`/repos/${ctx.owner}/${ctx.repo}/issues`, {
        method: 'POST',
        body: createBody,
      });

      // Write number to file FIRST (crash safety — prevents re-creation)
      const serialized = serializeIssue(created);
      await Bun.write(file.path, serialized);

      // Then rename
      const newPath = join(dirname(file.path), `issue-${created.number}.md`);
      await rename(file.path, newPath);

      stats.created++;
    } catch (err: any) {
      stats.skipped.push(`${file.name} (${err.message})`);
    }
  }

  console.log(JSON.stringify(buildPushResult(stats)));
}

main().catch((err) => {
  console.log(JSON.stringify({ status: 'error', summary: err.message }));
  process.exit(1);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/hooks/push-changed.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/gh/src/hooks/push-changed.ts plugins/gh/src/hooks/push-changed.test.ts
git commit -m "feat(gh): implement Stop push-changed hook script"
```

---

### Task 6: Add new-issue creation to `issue_push` MCP tool

**Files:**
- Modify: `plugins/gh/src/tools/issues.ts:207-253`

- [ ] **Step 1: Update imports and `issue_push` handler to create new issues**

In `plugins/gh/src/tools/issues.ts`, first update the imports at the top of the file:

```typescript
import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
```

Replace the existing `import { mkdir } from 'node:fs/promises'` line. The file doesn't currently import from `node:path`, so add `dirname` and `join`.

Then replace the `issue_push` handler's loop body. After `parseIssueFile`, check if `number` is undefined — if so, create instead of update:

```typescript
handler: async (args, ctx) => {
  const paths = await resolveIssuePaths(args.path);
  const results: any[] = [];
  const errors: any[] = [];

  for (const filePath of paths) {
    try {
      const content = await Bun.file(filePath).text();
      const { frontmatter, body } = parseIssueFile(content);

      if (frontmatter.number === undefined) {
        // Create new issue
        const createBody: Record<string, unknown> = { title: frontmatter.title, body };
        if (frontmatter.labels?.length) createBody.labels = frontmatter.labels;
        if (frontmatter.milestone) createBody.milestone = frontmatter.milestone;
        if (frontmatter.assignees?.length) createBody.assignees = frontmatter.assignees;

        const created = await api(`/repos/${ctx.owner}/${ctx.repo}/issues`, {
          method: 'POST',
          body: createBody,
        });

        // Write number to file first (crash safety)
        const serialized = serializeIssue(created);
        await Bun.write(filePath, serialized);

        // Rename file
        const newPath = join(dirname(filePath), `issue-${created.number}.md`);
        await rename(filePath, newPath);

        results.push({
          action: 'created',
          number: created.number,
          title: created.title,
          html_url: created.html_url,
          file: newPath.split('/').pop(),
        });
      } else {
        // Update existing issue
        const patchBody: Record<string, unknown> = {
          title: frontmatter.title,
          state: frontmatter.state,
          labels: frontmatter.labels,
          milestone: frontmatter.milestone,
          assignees: frontmatter.assignees,
          body,
        };

        const result = await api(
          `/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`,
          { method: 'PATCH', body: patchBody },
        );

        results.push({
          action: 'updated',
          number: result.number,
          title: result.title,
          html_url: result.html_url,
        });
      }
    } catch (err: any) {
      errors.push({
        file: filePath.split('/').pop(),
        error: err.message,
      });
    }
  }

  return errors.length > 0 ? { results, errors } : { results };
},
```

- [ ] **Step 2: Verify the MCP server still starts**

Run: `cd plugins/gh && timeout 5 bun run start 2>&1 || true`
Expected: Server starts and listens (will timeout since it reads stdin — that's expected). No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issues.ts
git commit -m "feat(gh): add new-issue creation to issue_push tool"
```

---

## Chunk 3: Hook wiring, skill, and integration

### Task 7: Create bash wrappers and hooks.json

**Files:**
- Create: `plugins/gh/hooks/hooks.json`
- Create: `plugins/gh/hooks/scripts/session-start-pull.sh`
- Create: `plugins/gh/hooks/scripts/stop-push.sh`

- [ ] **Step 1: Create hooks.json**

Create `plugins/gh/hooks/hooks.json`:

```json
{
  "description": "Auto-sync GitHub issue files in .issues/",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/session-start-pull.sh",
            "timeout": 30
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/stop-push.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Create session-start-pull.sh**

Create `plugins/gh/hooks/scripts/session-start-pull.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Read hook input from stdin (required by hook contract)
cat > /dev/null

# Delegate to Bun script — it handles all logic and outputs JSON to stdout
PLUGIN_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bun run "${PLUGIN_ROOT}/src/hooks/pull-existing.ts"
```

- [ ] **Step 3: Create stop-push.sh**

Create `plugins/gh/hooks/scripts/stop-push.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Read hook input from stdin (required by hook contract)
cat > /dev/null

# Delegate to Bun script — it handles all logic and outputs JSON to stdout
PLUGIN_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bun run "${PLUGIN_ROOT}/src/hooks/push-changed.ts"
```

- [ ] **Step 4: Make scripts executable**

Run: `chmod +x plugins/gh/hooks/scripts/session-start-pull.sh plugins/gh/hooks/scripts/stop-push.sh`

- [ ] **Step 5: Verify bash wrapper runs without error (will exit silently — no .issues/ dir)**

Run: `cd plugins/gh && bash hooks/scripts/session-start-pull.sh < /dev/null`
Expected: `{}` output (no `.issues/` directory, exits silently)

- [ ] **Step 6: Commit**

```bash
git add plugins/gh/hooks/hooks.json plugins/gh/hooks/scripts/session-start-pull.sh plugins/gh/hooks/scripts/stop-push.sh
git commit -m "feat(gh): add hook wiring (hooks.json + bash wrappers)"
```

---

### Task 8: Create `create-issue` skill

**Files:**
- Create: `plugins/gh/skills/create-issue/SKILL.md`

- [ ] **Step 1: Write the skill file**

Create `plugins/gh/skills/create-issue/SKILL.md`:

```markdown
---
name: create-issue
description: Create a new GitHub issue by writing a local markdown file with YAML frontmatter. The file is auto-synced to GitHub.
---

# Create Issue from File

Write a markdown file in `.issues/` to create a new GitHub issue. The file will be pushed to GitHub automatically on the next Stop hook, or manually via `issue_push`.

## File naming

Use `issue-new*.md` — for example:
- `issue-new.md`
- `issue-new-auth-bug.md`
- `issue-new-refactor-api.md`

## Frontmatter format

```yaml
---
title: "Issue title here"
state: open
labels:
  - bug
  - priority-high
milestone: 3
assignees:
  - username
---

Issue body in markdown.
```

Only `title` is required. All other fields are optional.

## What happens on push

1. The issue is created on GitHub via the API
2. The file's frontmatter is updated with the assigned `number`, `url`, and `pulled_at`
3. The file is renamed from `issue-new*.md` to `issue-{number}.md`

## Notes

- The `.issues/` directory must exist (create it with `issue_pull` first, or `mkdir .issues`)
- Auto-push happens on the Stop hook (after each Claude turn)
- You can also push manually: call `issue_push` with the `.issues/` directory path
```

- [ ] **Step 2: Commit**

```bash
git add plugins/gh/skills/create-issue/SKILL.md
git commit -m "feat(gh): add create-issue skill for file-based issue creation"
```

---

### Task 9: Update marketplace.json and plugin README

**Files:**
- Modify: `plugins/gh/README.md`
- Run: `./scripts/generate-marketplace.sh`

- [ ] **Step 1: Add hooks and skill documentation to README**

Append a new section to `plugins/gh/README.md` documenting:
- Auto-sync hooks (SessionStart pull, Stop push)
- The `.issues/` directory convention
- Creating new issues from `issue-new*.md` files
- Conflict handling behavior

- [ ] **Step 2: Regenerate marketplace.json**

Run: `./scripts/generate-marketplace.sh`

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/README.md .claude-plugin/marketplace.json
git commit -m "docs(gh): document auto-sync hooks and create-issue skill"
```

---

### Task 10: Integration smoke test

- [ ] **Step 1: Run all unit tests**

Run: `cd plugins/gh && bun test`
Expected: All tests pass

- [ ] **Step 2: Verify hook scripts run in a real repo context**

From within the `claude-plugins-backalley` repo:

```bash
cd plugins/gh
mkdir -p /tmp/test-hook-integration/.issues
# Create a dummy issue file
cat > /tmp/test-hook-integration/.issues/issue-new-test.md << 'EOF'
---
title: "Hook integration test (delete me)"
state: open
labels: []
milestone: null
assignees: []
---

This is a test issue created by the auto-sync hook integration test.
EOF

# Test that push-changed.ts can parse the file (won't actually push — no git repo context in /tmp)
cd /tmp/test-hook-integration
bun run /path/to/plugins/gh/src/hooks/push-changed.ts
```

Expected: `{}` output (not a git repo, exits silently)

Clean up: `rm -rf /tmp/test-hook-integration`

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run: `cd plugins/gh && bun build src/server.ts --target=bun --outdir=/tmp/gh-build-check 2>&1 && echo "Build OK"`
Expected: "Build OK" — no TypeScript errors

- [ ] **Step 4: Final commit if any cleanup needed, then run all tests one more time**

Run: `cd plugins/gh && bun test`
Expected: All tests pass
