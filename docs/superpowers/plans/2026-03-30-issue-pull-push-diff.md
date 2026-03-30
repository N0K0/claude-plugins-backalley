# issue_pull, issue_push, issue_diff Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three MCP tools to the gh plugin for token-efficient issue editing via local filesystem intermediary.

**Architecture:** New shared helper module (`issue-files.ts`) for frontmatter serialization/parsing, three new tool definitions added to existing `issues.ts`. Uses `yaml` package for YAML handling and a simple line-diff for unified diffs.

**Tech Stack:** Bun, TypeScript, `yaml` (eemeli/yaml), MCP SDK, zod

**Spec:** `docs/superpowers/specs/2026-03-30-issue-pull-push-diff-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `plugins/gh/src/tools/issue-files.ts` | Create | Frontmatter types, serialize/parse/path helpers, unified diff |
| `plugins/gh/src/tools/issues.ts` | Modify | Add `issue_pull`, `issue_push`, `issue_diff` tool definitions |
| `plugins/gh/package.json` | Modify | Add `yaml` dependency |

No changes to `server.ts`, `types.ts`, or `gh.ts`.

---

## Chunk 1: Setup and shared helpers

### Task 1: Add yaml dependency

**Files:**
- Modify: `plugins/gh/package.json`

- [ ] **Step 1: Install yaml package**

Run:
```bash
cd plugins/gh && bun add yaml
```

- [ ] **Step 2: Verify installation**

Run:
```bash
cd plugins/gh && bun -e "import { stringify, parse } from 'yaml'; console.log(stringify({ test: true }))"
```
Expected: `test: true\n`

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/package.json plugins/gh/bun.lock
git commit -m "feat(gh): add yaml dependency for issue file frontmatter"
```

---

### Task 2: Create issue-files.ts — types and serialization

**Files:**
- Create: `plugins/gh/src/tools/issue-files.ts`

- [ ] **Step 1: Write the frontmatter type and serializeIssue**

```typescript
import { stringify, parse } from 'yaml';

/** Frontmatter fields stored in issue markdown files */
export interface IssueFrontmatter {
  number: number;
  title: string;
  state: string;
  labels: string[];
  milestone: number | null;
  assignees: string[];
  url: string;
  pulled_at: string;
}

/** Result of parsing an issue markdown file */
export interface ParsedIssueFile {
  frontmatter: IssueFrontmatter;
  body: string;
}

/** Build the file path for an issue in a directory */
export function issueFilePath(dir: string, number: number): string {
  return `${dir}/issue-${number}.md`;
}

/**
 * Serialize a raw GitHub API issue object into markdown with YAML frontmatter.
 * Takes the raw API response (pre-slim) and extracts fields internally.
 */
export function serializeIssue(raw: any): string {
  const frontmatter: IssueFrontmatter = {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    labels: (raw.labels ?? []).map((l: any) => l.name ?? l),
    milestone: raw.milestone?.number ?? null,
    assignees: (raw.assignees ?? []).map((a: any) => a.login ?? a),
    url: raw.html_url,
    pulled_at: new Date().toISOString(),
  };

  const yamlStr = stringify(frontmatter, { lineWidth: 0 });
  const body = raw.body ?? '';
  return `---\n${yamlStr}---\n\n${body}\n`;
}
```

- [ ] **Step 2: Verify serializeIssue manually**

Run:
```bash
cd plugins/gh && bun -e "
import { serializeIssue } from './src/tools/issue-files.ts';
const fake = { number: 1, title: 'Test', state: 'open', labels: [{ name: 'bug' }], milestone: null, assignees: [{ login: 'user1' }], html_url: 'https://example.com/1', body: 'Hello world' };
console.log(serializeIssue(fake));
"
```
Expected: YAML frontmatter with `---` delimiters followed by `Hello world`.

- [ ] **Step 3: Add parseIssueFile**

Add to `issue-files.ts`:

```typescript
/**
 * Parse a markdown file with YAML frontmatter into structured data.
 * Expects `---` delimiters around the YAML block.
 */
export function parseIssueFile(content: string): ParsedIssueFile {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid issue file: missing YAML frontmatter delimiters');
  }

  const frontmatter = parse(match[1]) as IssueFrontmatter;
  if (!frontmatter.number) {
    throw new Error('Invalid issue file: missing "number" in frontmatter');
  }

  // Trim trailing newline added by serializeIssue
  const body = match[2].replace(/\n$/, '');

  return { frontmatter, body };
}
```

- [ ] **Step 4: Verify parseIssueFile round-trips**

Run:
```bash
cd plugins/gh && bun -e "
import { serializeIssue, parseIssueFile } from './src/tools/issue-files.ts';
const fake = { number: 1, title: 'Test', state: 'open', labels: [{ name: 'bug' }], milestone: null, assignees: [{ login: 'user1' }], html_url: 'https://example.com/1', body: 'Hello world' };
const md = serializeIssue(fake);
const parsed = parseIssueFile(md);
console.log(JSON.stringify(parsed, null, 2));
console.log('Round-trip OK:', parsed.frontmatter.number === 1 && parsed.body === 'Hello world');
"
```
Expected: `Round-trip OK: true`

- [ ] **Step 5: Commit**

```bash
git add plugins/gh/src/tools/issue-files.ts
git commit -m "feat(gh): add issue-files.ts with serialize/parse helpers"
```

---

### Task 3: Add unified diff helper to issue-files.ts

**Files:**
- Modify: `plugins/gh/src/tools/issue-files.ts`

- [ ] **Step 1: Implement unifiedDiff**

Add to `issue-files.ts`:

```typescript
/**
 * Generate a unified diff between two strings, line by line.
 * Returns null if strings are identical.
 * Uses a simple LCS-based diff algorithm.
 */
export function unifiedDiff(
  oldStr: string,
  newStr: string,
  oldLabel: string,
  newLabel: string,
): string | null {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  if (oldStr === newStr) return null;

  // Simple LCS to find common subsequence
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build diff operations
  const ops: Array<{ type: 'keep' | 'del' | 'add'; line: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'keep', line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', line: newLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: 'del', line: oldLines[i - 1] });
      i--;
    }
  }

  // Format as unified diff with hunks
  const lines: string[] = [`--- ${oldLabel}`, `+++ ${newLabel}`];

  // Group into hunks (context of 3 lines)
  const ctx = 3;
  let hunkStart = -1;
  const hunkLines: string[] = [];
  let oldPos = 0, newPos = 0;
  let hunkOldStart = 0, hunkNewStart = 0, hunkOldCount = 0, hunkNewCount = 0;

  function flushHunk() {
    if (hunkLines.length > 0) {
      lines.push(`@@ -${hunkOldStart + 1},${hunkOldCount} +${hunkNewStart + 1},${hunkNewCount} @@`);
      lines.push(...hunkLines);
      hunkLines.length = 0;
    }
  }

  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    const isChange = op.type !== 'keep';

    if (isChange) {
      if (hunkStart === -1) {
        // Start new hunk with context
        hunkStart = idx;
        hunkOldStart = oldPos - Math.min(ctx, oldPos);
        hunkNewStart = newPos - Math.min(ctx, newPos);
        hunkOldCount = 0;
        hunkNewCount = 0;
        // Add leading context
        const contextStart = Math.max(0, idx - ctx);
        for (let c = contextStart; c < idx; c++) {
          hunkLines.push(` ${ops[c].line}`);
          hunkOldCount++;
          hunkNewCount++;
        }
      }
    }

    if (hunkStart !== -1) {
      if (op.type === 'keep') {
        hunkLines.push(` ${op.line}`);
        hunkOldCount++;
        hunkNewCount++;
        // Check if we're far enough from changes to end hunk
        let nextChange = -1;
        for (let look = idx + 1; look < ops.length && look <= idx + ctx * 2; look++) {
          if (ops[look].type !== 'keep') { nextChange = look; break; }
        }
        if (nextChange === -1 && idx - hunkStart > ctx) {
          // Trim trailing context to ctx lines (remove from end)
          while (hunkLines.length > 0 && hunkLines[hunkLines.length - 1].startsWith(' ')) {
            const trailingContext = hunkLines.filter((l, i) => {
              // Count consecutive trailing context lines
              let count = 0;
              for (let k = hunkLines.length - 1; k >= 0; k--) {
                if (hunkLines[k].startsWith(' ')) count++;
                else break;
              }
              return i >= hunkLines.length - count;
            }).length;
            if (trailingContext <= ctx) break;
            hunkLines.pop();
            hunkOldCount--;
            hunkNewCount--;
          }
          flushHunk();
          hunkStart = -1;
        }
      } else if (op.type === 'del') {
        hunkLines.push(`-${op.line}`);
        hunkOldCount++;
      } else {
        hunkLines.push(`+${op.line}`);
        hunkNewCount++;
      }
    }

    if (op.type === 'keep' || op.type === 'del') oldPos++;
    if (op.type === 'keep' || op.type === 'add') newPos++;
  }

  flushHunk();

  return lines.join('\n');
}
```

- [ ] **Step 2: Verify unifiedDiff**

Run:
```bash
cd plugins/gh && bun -e "
import { unifiedDiff } from './src/tools/issue-files.ts';
const old = 'line1\nline2\nline3\nline4';
const new_ = 'line1\nline2 modified\nline3\nline4\nline5';
console.log(unifiedDiff(old, new_, 'a/issue-1 (remote)', 'b/issue-1 (local)'));
console.log('---');
console.log('Identical returns null:', unifiedDiff('same', 'same', 'a', 'b'));
"
```
Expected: Unified diff output with `---`/`+++` headers and `@@` hunks, then `Identical returns null: null`.

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issue-files.ts
git commit -m "feat(gh): add unified diff helper for issue body comparison"
```

---

### Task 4: Add resolveIssuePaths helper to issue-files.ts

**Files:**
- Modify: `plugins/gh/src/tools/issue-files.ts`

Both `issue_push` and `issue_diff` need to resolve a path that could be a file or directory into a list of issue markdown files.

- [ ] **Step 1: Implement resolveIssuePaths**

Add to `issue-files.ts`:

```typescript
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Resolve a path (file or directory) into a list of issue markdown file paths.
 * If path is a file, returns [path].
 * If path is a directory, returns all issue-*.md files in it.
 */
export async function resolveIssuePaths(path: string): Promise<string[]> {
  const s = await stat(path);
  if (s.isFile()) return [path];
  if (s.isDirectory()) {
    const entries = await readdir(path);
    return entries
      .filter(e => /^issue-\d+\.md$/.test(e))
      .sort((a, b) => {
        const numA = parseInt(a.match(/issue-(\d+)/)?.[1] ?? '0');
        const numB = parseInt(b.match(/issue-(\d+)/)?.[1] ?? '0');
        return numA - numB;
      })
      .map(e => join(path, e));
  }
  throw new Error(`Path is neither a file nor directory: ${path}`);
}
```

- [ ] **Step 2: Verify resolveIssuePaths**

Run:
```bash
cd plugins/gh && mkdir -p /tmp/test-issues && echo "test" > /tmp/test-issues/issue-1.md && echo "test" > /tmp/test-issues/issue-5.md && echo "test" > /tmp/test-issues/other.txt && bun -e "
import { resolveIssuePaths } from './src/tools/issue-files.ts';
// Directory mode
const files = await resolveIssuePaths('/tmp/test-issues');
console.log('Dir:', files);
// File mode
const single = await resolveIssuePaths('/tmp/test-issues/issue-1.md');
console.log('File:', single);
" && rm -rf /tmp/test-issues
```
Expected: Dir shows `issue-1.md` and `issue-5.md` (sorted, no `other.txt`). File shows just `issue-1.md`.

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issue-files.ts
git commit -m "feat(gh): add resolveIssuePaths helper for file/dir resolution"
```

---

## Chunk 2: Tool implementations

### Task 5: Implement issue_pull tool

**Files:**
- Modify: `plugins/gh/src/tools/issues.ts`

- [ ] **Step 1: Add imports and issue_pull tool definition**

Add these imports to the top of `issues.ts` (below existing imports):

```typescript
import { mkdir } from 'node:fs/promises';
import { serializeIssue, issueFilePath } from './issue-files.js';
```

Add to the `tools` array:

```typescript
{
  name: 'issue_pull',
  description: 'Pull GitHub issues to local markdown files with YAML frontmatter for token-efficient editing',
  inputSchema: z.object({
    ...repoParams,
    issue_number: z.number().optional().describe('Pull a single issue'),
    labels: z.string().optional().describe('Comma-separated label names'),
    state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by state'),
    milestone: z.string().optional().describe('Milestone number, "*", or "none"'),
    assignee: z.string().optional().describe('Username or "none"'),
    path: z.string().describe('Absolute path to output directory'),
  }),
  handler: async (args, ctx) => {
    await mkdir(args.path, { recursive: true });

    let issues: any[];

    if (args.issue_number) {
      // Single issue fetch
      const issue = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}`);
      issues = [issue];
    } else {
      // Bulk fetch with pagination
      issues = [];
      let page = 1;
      while (true) {
        const fields: Record<string, string> = {
          state: args.state ?? 'open',
          per_page: '100',
          page: String(page),
        };
        if (args.labels) fields.labels = args.labels;
        if (args.milestone) fields.milestone = args.milestone;
        if (args.assignee) fields.assignee = args.assignee;

        const batch = await api(`/repos/${ctx.owner}/${ctx.repo}/issues`, { fields });
        if (!Array.isArray(batch) || batch.length === 0) break;
        issues.push(...batch);
        if (batch.length < 100) break;
        page++;
      }
    }

    const files = [];
    for (const issue of issues) {
      const filePath = issueFilePath(args.path, issue.number);
      const content = serializeIssue(issue);
      await Bun.write(filePath, content);
      files.push({ path: filePath, number: issue.number, title: issue.title });
    }

    return { path: args.path, files };
  },
},
```

- [ ] **Step 2: Verify issue_pull works with the MCP server**

Run:
```bash
cd plugins/gh && bun -e "
import { api } from './src/gh.ts';
import { serializeIssue, issueFilePath } from './src/tools/issue-files.ts';
import { mkdir } from 'node:fs/promises';

// Test with a single issue from this repo
const issue = await api('/repos/N0K0/claude-plugins-backalley/issues/118');
const dir = '/tmp/test-pull';
await mkdir(dir, { recursive: true });
const filePath = issueFilePath(dir, issue.number);
await Bun.write(filePath, serializeIssue(issue));
const written = await Bun.file(filePath).text();
console.log(written.slice(0, 300));
console.log('...');
console.log('File written OK');
" && rm -rf /tmp/test-pull
```
Expected: YAML frontmatter with issue #118 details followed by body content.

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issues.ts
git commit -m "feat(gh): implement issue_pull tool"
```

---

### Task 6: Implement issue_push tool

**Files:**
- Modify: `plugins/gh/src/tools/issues.ts`

- [ ] **Step 1: Add imports and issue_push tool definition**

Replace the `issue-files.js` import line added in Task 5 with this expanded version:

```typescript
import { serializeIssue, parseIssueFile, issueFilePath, resolveIssuePaths } from './issue-files.js';
```

Add to the `tools` array:

```typescript
{
  name: 'issue_push',
  description: 'Push local markdown issue file(s) back to GitHub, updating title, state, labels, milestone, assignees, and body',
  inputSchema: z.object({
    ...repoParams,
    path: z.string().describe('Path to a markdown file or directory of issue files'),
  }),
  handler: async (args, ctx) => {
    const paths = await resolveIssuePaths(args.path);
    const results: any[] = [];
    const errors: any[] = [];

    for (const filePath of paths) {
      try {
        const content = await Bun.file(filePath).text();
        const { frontmatter, body } = parseIssueFile(content);

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
          number: result.number,
          title: result.title,
          html_url: result.html_url,
        });
      } catch (err: any) {
        errors.push({
          file: filePath.split('/').pop(),
          error: err.message,
        });
      }
    }

    return errors.length > 0 ? { results, errors } : { results };
  },
},
```

- [ ] **Step 2: Verify issue_push parses and would send correct payload**

Run a dry verification (parse only, don't actually push):
```bash
cd plugins/gh && bun -e "
import { serializeIssue, parseIssueFile } from './src/tools/issue-files.ts';

// Simulate: serialize a fake issue, parse it back, verify push payload
const fake = { number: 999, title: 'Test Push', state: 'open', labels: [{ name: 'bug' }], milestone: { number: 3 }, assignees: [{ login: 'user1' }], html_url: 'https://example.com/999', body: 'Push body' };
const md = serializeIssue(fake);
const { frontmatter, body } = parseIssueFile(md);

const payload = {
  title: frontmatter.title,
  state: frontmatter.state,
  labels: frontmatter.labels,
  milestone: frontmatter.milestone,
  assignees: frontmatter.assignees,
  body,
};
console.log(JSON.stringify(payload, null, 2));
console.log('Payload OK:', payload.title === 'Test Push' && payload.milestone === 3 && payload.body === 'Push body');
"
```
Expected: `Payload OK: true`

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issues.ts
git commit -m "feat(gh): implement issue_push tool with continue-on-error"
```

---

### Task 7: Implement issue_diff tool

**Files:**
- Modify: `plugins/gh/src/tools/issues.ts`

- [ ] **Step 1: Add unifiedDiff to the issue-files.js import**

Replace the `issue-files.js` import line (updated in Task 6) with this final version:

```typescript
import { serializeIssue, parseIssueFile, issueFilePath, resolveIssuePaths, unifiedDiff } from './issue-files.js';
```

Add to the `tools` array:

```typescript
{
  name: 'issue_diff',
  description: 'Compare local issue file(s) against current GitHub state, showing a unified diff of changes',
  inputSchema: z.object({
    ...repoParams,
    path: z.string().describe('Path to a markdown file or directory of issue files'),
  }),
  handler: async (args, ctx) => {
    const paths = await resolveIssuePaths(args.path);
    const diffs: any[] = [];

    for (const filePath of paths) {
      const content = await Bun.file(filePath).text();
      const { frontmatter, body } = parseIssueFile(content);

      const remote = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`);

      // Compare frontmatter fields
      const changes: string[] = [];
      const remoteLabels = (remote.labels ?? []).map((l: any) => l.name ?? l) as string[];
      const remoteMilestone = remote.milestone?.number ?? null;
      const remoteAssignees = (remote.assignees ?? []).map((a: any) => a.login ?? a) as string[];

      if (remote.title !== frontmatter.title) {
        changes.push(`title: "${remote.title}" → "${frontmatter.title}"`);
      }
      if (remote.state !== frontmatter.state) {
        changes.push(`state: ${remote.state} → ${frontmatter.state}`);
      }

      // Label diff
      const addedLabels = frontmatter.labels.filter(l => !remoteLabels.includes(l));
      const removedLabels = remoteLabels.filter(l => !frontmatter.labels.includes(l));
      if (addedLabels.length || removedLabels.length) {
        const parts: string[] = [];
        if (addedLabels.length) parts.push(addedLabels.map(l => `+${l}`).join(' '));
        if (removedLabels.length) parts.push(removedLabels.map(l => `-${l}`).join(' '));
        changes.push(`labels: ${parts.join(' ')}`);
      }

      if (remoteMilestone !== frontmatter.milestone) {
        changes.push(`milestone: ${remoteMilestone} → ${frontmatter.milestone}`);
      }

      const addedAssignees = frontmatter.assignees.filter(a => !remoteAssignees.includes(a));
      const removedAssignees = remoteAssignees.filter(a => !frontmatter.assignees.includes(a));
      if (addedAssignees.length || removedAssignees.length) {
        const parts: string[] = [];
        if (addedAssignees.length) parts.push(addedAssignees.map(a => `+${a}`).join(' '));
        if (removedAssignees.length) parts.push(removedAssignees.map(a => `-${a}`).join(' '));
        changes.push(`assignees: ${parts.join(' ')}`);
      }

      // Body diff
      const remoteBody = remote.body ?? '';
      const bodyDiff = unifiedDiff(
        remoteBody,
        body,
        `a/issue-${frontmatter.number} (remote)`,
        `b/issue-${frontmatter.number} (local)`,
      );

      // Remote newer check
      const remoteNewer = frontmatter.pulled_at
        ? new Date(remote.updated_at) > new Date(frontmatter.pulled_at)
        : false;

      const status = (changes.length > 0 || bodyDiff !== null) ? 'modified' : 'up_to_date';

      diffs.push({
        number: frontmatter.number,
        title: frontmatter.title,
        status,
        changes,
        body_diff: bodyDiff,
        remote_newer: remoteNewer,
      });
    }

    return { diffs };
  },
},
```

- [ ] **Step 2: Verify issue_diff with a real issue**

Run:
```bash
cd plugins/gh && bun -e "
import { api } from './src/gh.ts';
import { serializeIssue, parseIssueFile, unifiedDiff } from './src/tools/issue-files.ts';
import { mkdir } from 'node:fs/promises';

// Pull issue, modify locally, diff
const remote = await api('/repos/N0K0/claude-plugins-backalley/issues/118');
const md = serializeIssue(remote);
// Simulate a local edit
const modified = md.replace('# Spec:', '# Updated Spec:');
const { frontmatter, body } = parseIssueFile(modified);
const remoteBody = remote.body ?? '';
const diff = unifiedDiff(remoteBody, body, 'a/issue-118 (remote)', 'b/issue-118 (local)');
console.log(diff ? diff.slice(0, 500) : 'No diff');
console.log('Diff generated OK:', diff !== null);
" && rm -rf /tmp/test-diff
```
Expected: Unified diff showing the title change, `Diff generated OK: true`.

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issues.ts
git commit -m "feat(gh): implement issue_diff tool with unified diff output"
```

---

## Chunk 3: Integration verification

### Task 8: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Verify the MCP server starts and lists all new tools**

Run:
```bash
cd plugins/gh && echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"1.0"},"protocolVersion":"2024-11-05"}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | timeout 5 bun src/server.ts 2>/dev/null | grep -o '"issue_pull"\|"issue_push"\|"issue_diff"' | sort
```
Expected: All three tool names appear: `"issue_diff"`, `"issue_pull"`, `"issue_push"`

- [ ] **Step 2: Test full pull→edit→diff→push cycle (dry run)**

Test against a real issue but only verify the diff step (don't push):
```bash
cd plugins/gh && bun -e "
import { api } from './src/gh.ts';
import { serializeIssue, parseIssueFile, issueFilePath, unifiedDiff } from './src/tools/issue-files.ts';
import { mkdir } from 'node:fs/promises';

const dir = '/tmp/test-cycle';
await mkdir(dir, { recursive: true });

// 1. Pull
const issue = await api('/repos/N0K0/claude-plugins-backalley/issues/118');
const filePath = issueFilePath(dir, issue.number);
await Bun.write(filePath, serializeIssue(issue));
console.log('1. Pulled to', filePath);

// 2. Read back and verify
const content = await Bun.file(filePath).text();
const parsed = parseIssueFile(content);
console.log('2. Parsed OK, number:', parsed.frontmatter.number, 'body length:', parsed.body.length);

// 3. Diff (should be clean — just pulled)
const remoteBody = issue.body ?? '';
const diff = unifiedDiff(remoteBody, parsed.body, 'a/remote', 'b/local');
console.log('3. Diff after pull (should be null):', diff);

// 4. Simulate edit
const edited = content.replace(parsed.frontmatter.title, parsed.frontmatter.title + ' [edited]');
await Bun.write(filePath, edited);
const editedParsed = parseIssueFile(await Bun.file(filePath).text());
console.log('4. Title after edit:', editedParsed.frontmatter.title);

// 5. Diff after edit
const changes = [];
if (issue.title !== editedParsed.frontmatter.title) changes.push('title changed');
console.log('5. Changes detected:', changes);

console.log('\\nFull cycle OK');
" && rm -rf /tmp/test-cycle
```
Expected: `Full cycle OK` with clean diff after pull and detected title change after edit.

- [ ] **Step 3: Final commit — update README**

Update `plugins/gh/README.md` to document the three new tools, then:

```bash
git add plugins/gh/README.md
git commit -m "docs(gh): document issue_pull, issue_push, issue_diff tools"
```
