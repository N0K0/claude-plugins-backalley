# gh Plugin Slimdown Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the gh MCP server from 26 tools to 5, add comment sync to issue pull/push, and replace API-based issue_search with local frontmatter search.

**Architecture:** Extend `issue-files.ts` with comment serialization/parsing. Create new tool files `issue-sync.ts` and `issue-search.ts` replacing the old `issues.ts`. Update hooks to handle comments. Delete all PR, label, milestone, and project tool files.

**Tech Stack:** Bun, TypeScript, Zod, MCP SDK, YAML, gh CLI

**Spec:** `docs/superpowers/specs/2026-04-03-gh-plugin-slimdown-design.md`

---

## Chunk 1: Comment Serialization in issue-files.ts

### Task 1: Add Comment type and update ParsedIssueFile

**Files:**
- Modify: `plugins/gh/src/tools/issue-files.ts:5-21`
- Test: `plugins/gh/src/tools/issue-files.test.ts`

- [ ] **Step 1: Write failing tests for comment parsing**

Add to `issue-files.test.ts`:

```typescript
describe('parseIssueFile with comments', () => {
  test('parses issue with comments section', () => {
    const content = `---
number: 42
title: "Test issue"
state: open
labels: []
milestone: null
assignees: []
---

Body content here.

## Comments

### @alice — 2026-03-28T10:18:06Z <!-- id:12345 -->

First comment.

### @bob — 2026-03-29T14:22:00Z <!-- id:12346 -->

Second comment.
`;
    const result = parseIssueFile(content);
    expect(result.body).toBe('Body content here.');
    expect(result.comments).toHaveLength(2);
    expect(result.comments[0]).toEqual({
      id: 12345,
      author: 'alice',
      timestamp: '2026-03-28T10:18:06Z',
      body: 'First comment.',
    });
    expect(result.comments[1]).toEqual({
      id: 12346,
      author: 'bob',
      timestamp: '2026-03-29T14:22:00Z',
      body: 'Second comment.',
    });
  });

  test('parses new comment (no id, no timestamp)', () => {
    const content = `---
number: 42
title: "Test"
state: open
labels: []
milestone: null
assignees: []
---

Body.

## Comments

### @alice — new

New comment text.
`;
    const result = parseIssueFile(content);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]).toEqual({
      author: 'alice',
      body: 'New comment text.',
    });
  });

  test('parses issue without comments section', () => {
    const content = `---
number: 42
title: "Test"
state: open
labels: []
milestone: null
assignees: []
---

Body only.`;
    const result = parseIssueFile(content);
    expect(result.body).toBe('Body only.');
    expect(result.comments).toEqual([]);
  });

  test('parses empty body with comments', () => {
    const content = `---
number: 42
title: "Test"
state: open
labels: []
milestone: null
assignees: []
---

## Comments

### @alice — 2026-03-28T10:00:00Z <!-- id:100 -->

A comment on an empty-body issue.
`;
    const result = parseIssueFile(content);
    expect(result.body).toBe('');
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].id).toBe(100);
  });

  test('roundtrip: serializeIssue then parseIssueFile', () => {
    const raw = {
      number: 42, title: 'Roundtrip', state: 'open',
      labels: [{ name: 'bug' }], milestone: null, assignees: [],
      html_url: 'https://github.com/o/r/issues/42', body: 'Body text.',
    };
    const comments = [
      { id: 200, user: { login: 'alice' }, created_at: '2026-03-28T10:00:00Z', body: 'Comment.' },
    ];
    const serialized = serializeIssue(raw, comments);
    const parsed = parseIssueFile(serialized);
    expect(parsed.body).toBe('Body text.');
    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].id).toBe(200);
    expect(parsed.comments[0].body).toBe('Comment.');
  });

  test('handles multi-line comment bodies', () => {
    const content = `---
number: 42
title: "Test"
state: open
labels: []
milestone: null
assignees: []
---

Body.

## Comments

### @alice — 2026-03-28T10:00:00Z <!-- id:100 -->

Line one.

Line two with **bold**.

\`\`\`js
code block
\`\`\`
`;
    const result = parseIssueFile(content);
    expect(result.comments[0].body).toBe(
      'Line one.\n\nLine two with **bold**.\n\n```js\ncode block\n```'
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: FAIL — `comments` property does not exist on `ParsedIssueFile`

- [ ] **Step 3: Add Comment interface and update ParsedIssueFile**

In `issue-files.ts`, add after the `IssueFrontmatter` interface (line 15):

```typescript
/** A single comment on an issue */
export interface Comment {
  id?: number;        // GitHub comment ID — absent for new comments
  author: string;     // GitHub username
  timestamp?: string; // ISO 8601 created_at — absent for new comments
  body: string;       // Comment body markdown
}
```

Update `ParsedIssueFile` (lines 17-21):

```typescript
/** Result of parsing an issue markdown file */
export interface ParsedIssueFile {
  frontmatter: IssueFrontmatter;
  body: string;
  comments: Comment[];
}
```

- [ ] **Step 4: Update parseIssueFile to split body and comments**

Replace the `parseIssueFile` function (lines 53-68) with:

```typescript
/**
 * Parse a markdown file with YAML frontmatter into structured data.
 * Expects `---` delimiters around the YAML block.
 * Splits body from ## Comments section (last occurrence preceded by blank line).
 */
export function parseIssueFile(content: string): ParsedIssueFile {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid issue file: missing YAML frontmatter delimiters');
  }

  const frontmatter = parse(match[1]) as IssueFrontmatter;
  if (typeof frontmatter.title !== 'string' || !frontmatter.title) {
    throw new Error('Invalid issue file: missing "title" in frontmatter');
  }

  const rawContent = match[2].replace(/\n$/, '');

  // Split body from comments at last "\n\n## Comments\n"
  // Also handle empty body where rawContent starts with "## Comments\n"
  const commentMarker = '\n\n## Comments\n';
  let commentSplit = rawContent.lastIndexOf(commentMarker);
  let body: string;
  let commentsRaw: string;

  if (commentSplit !== -1) {
    body = rawContent.slice(0, commentSplit);
    commentsRaw = rawContent.slice(commentSplit + commentMarker.length);
  } else if (rawContent.startsWith('## Comments\n')) {
    body = '';
    commentsRaw = rawContent.slice('## Comments\n'.length);
  } else {
    return { frontmatter, body: rawContent, comments: [] };
  }
  const comments = parseComments(commentsRaw);

  return { frontmatter, body, comments };
}

/** Comment heading pattern: ### @author — timestamp <!-- id:NNNNN --> or ### @author — new */
const COMMENT_HEADING_RE = /^### @(\S+) — (.+)$/;
const COMMENT_ID_RE = /<!-- id:(\d+) -->/;

/**
 * Parse the raw text after "## Comments\n" into Comment[].
 */
function parseComments(raw: string): Comment[] {
  const comments: Comment[] = [];
  const lines = raw.split('\n');
  let current: Comment | null = null;
  const bodyLines: string[] = [];

  function flushCurrent() {
    if (current) {
      current.body = bodyLines.join('\n').trim();
      comments.push(current);
      bodyLines.length = 0;
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(COMMENT_HEADING_RE);
    if (headingMatch) {
      flushCurrent();
      const author = headingMatch[1];
      const rest = headingMatch[2];
      const idMatch = rest.match(COMMENT_ID_RE);

      if (rest.trim() === 'new') {
        current = { author, body: '' };
      } else {
        const timestamp = rest.replace(COMMENT_ID_RE, '').trim();
        current = {
          id: idMatch ? parseInt(idMatch[1]) : undefined,
          author,
          timestamp: timestamp || undefined,
          body: '',
        };
      }
    } else if (current) {
      bodyLines.push(line);
    }
  }

  flushCurrent();
  return comments;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add plugins/gh/src/tools/issue-files.ts plugins/gh/src/tools/issue-files.test.ts
git commit -m "feat(gh): add comment parsing to issue-files.ts"
```

### Task 2: Add comment serialization to serializeIssue

**Files:**
- Modify: `plugins/gh/src/tools/issue-files.ts:32-47`
- Test: `plugins/gh/src/tools/issue-files.test.ts`

- [ ] **Step 1: Write failing tests for comment serialization**

Add to `issue-files.test.ts`:

```typescript
describe('serializeIssue with comments', () => {
  test('serializes issue with comments', () => {
    const raw = {
      number: 42,
      title: 'Test issue',
      state: 'open',
      labels: [{ name: 'bug' }],
      milestone: null,
      assignees: [],
      html_url: 'https://github.com/owner/repo/issues/42',
      body: 'Issue body.',
    };
    const comments = [
      { id: 100, user: { login: 'alice' }, created_at: '2026-03-28T10:00:00Z', body: 'First comment.' },
      { id: 101, user: { login: 'bob' }, created_at: '2026-03-29T14:00:00Z', body: 'Second comment.' },
    ];
    const result = serializeIssue(raw, comments);
    expect(result).toContain('## Comments');
    expect(result).toContain('### @alice — 2026-03-28T10:00:00Z <!-- id:100 -->');
    expect(result).toContain('First comment.');
    expect(result).toContain('### @bob — 2026-03-29T14:00:00Z <!-- id:101 -->');
    expect(result).toContain('Second comment.');
  });

  test('omits comments section when no comments', () => {
    const raw = {
      number: 1,
      title: 'No comments',
      state: 'open',
      labels: [],
      milestone: null,
      assignees: [],
      html_url: 'https://github.com/owner/repo/issues/1',
      body: 'Body.',
    };
    const result = serializeIssue(raw, []);
    expect(result).not.toContain('## Comments');
  });

  test('backward compat: serializeIssue without comments arg', () => {
    const raw = {
      number: 1,
      title: 'Compat',
      state: 'open',
      labels: [],
      milestone: null,
      assignees: [],
      html_url: 'https://github.com/owner/repo/issues/1',
      body: 'Body.',
    };
    const result = serializeIssue(raw);
    expect(result).not.toContain('## Comments');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: FAIL — `serializeIssue` doesn't accept comments argument

- [ ] **Step 3: Update serializeIssue to accept and serialize comments**

Replace `serializeIssue` (lines 32-47) with:

```typescript
/**
 * Serialize a raw GitHub API issue object into markdown with YAML frontmatter.
 * Optionally includes comments as a ## Comments section.
 * @param raw - Raw GitHub API issue response
 * @param comments - Optional array of raw GitHub API comment objects
 */
export function serializeIssue(raw: any, comments?: any[]): string {
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
  let result = `---\n${yamlStr}---\n\n${body}\n`;

  if (comments && comments.length > 0) {
    result += '\n## Comments\n';
    for (const c of comments) {
      const author = c.user?.login ?? c.user ?? 'unknown';
      const timestamp = c.created_at;
      const id = c.id;
      result += `\n### @${author} — ${timestamp} <!-- id:${id} -->\n\n${c.body}\n`;
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Also add serializeComments helper for push rewrite**

Add after `serializeIssue`:

```typescript
/**
 * Serialize parsed Comment[] back to the ## Comments markdown section.
 * Used when rewriting a file after push (where we have Comment objects, not raw API objects).
 */
export function serializeComments(comments: Comment[]): string {
  if (comments.length === 0) return '';
  let result = '\n## Comments\n';
  for (const c of comments) {
    if (c.id !== undefined && c.timestamp) {
      result += `\n### @${c.author} — ${c.timestamp} <!-- id:${c.id} -->\n\n${c.body}\n`;
    } else {
      result += `\n### @${c.author} — new\n\n${c.body}\n`;
    }
  }
  return result;
}
```

- [ ] **Step 6: Write test for serializeComments**

```typescript
describe('serializeComments', () => {
  test('serializes existing and new comments', () => {
    const comments: Comment[] = [
      { id: 100, author: 'alice', timestamp: '2026-03-28T10:00:00Z', body: 'Existing.' },
      { author: 'bob', body: 'New comment.' },
    ];
    const result = serializeComments(comments);
    expect(result).toContain('### @alice — 2026-03-28T10:00:00Z <!-- id:100 -->');
    expect(result).toContain('Existing.');
    expect(result).toContain('### @bob — new');
    expect(result).toContain('New comment.');
  });

  test('returns empty string for no comments', () => {
    expect(serializeComments([])).toBe('');
  });
});
```

- [ ] **Step 7: Run all tests**

Run: `cd plugins/gh && bun test src/tools/issue-files.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add plugins/gh/src/tools/issue-files.ts plugins/gh/src/tools/issue-files.test.ts
git commit -m "feat(gh): add comment serialization to serializeIssue"
```

---

## Chunk 2: New Tool Files (issue-sync.ts, issue-search.ts)

### Task 3: Create issue-sync.ts with issue_pull (with comments)

**Files:**
- Create: `plugins/gh/src/tools/issue-sync.ts`
- Reference: `plugins/gh/src/tools/issues.ts:177-233` (existing issue_pull)

- [ ] **Step 1: Create issue-sync.ts with issue_pull tool**

Create `plugins/gh/src/tools/issue-sync.ts`:

**Before creating this file**, add `fetchAllComments` to `gh.ts` (after the `api` function, around line 80):

```typescript
/**
 * Fetch all comments for an issue, paginated.
 */
export async function fetchAllComments(owner: string, repo: string, issueNumber: number): Promise<any[]> {
  const comments: any[] = [];
  let page = 1;
  while (true) {
    const batch = await api(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      fields: { per_page: '100', page: String(page) },
    });
    if (!Array.isArray(batch) || batch.length === 0) break;
    comments.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return comments;
}
```

Then create `plugins/gh/src/tools/issue-sync.ts`:

```typescript
import { z } from 'zod';
import { api, fetchAllComments } from '../gh.js';
import { repoParams, type ToolDef } from '../types.js';
import { mkdir } from 'node:fs/promises';
import { serializeIssue, issueFilePath, resolveIssuePaths } from './issue-files.js';

export const tools: ToolDef[] = [
  {
    name: 'issue_pull',
    description: 'Pull GitHub issues to local markdown files with YAML frontmatter and comments',
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
        const issue = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}`);
        issues = [issue];
      } else {
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

      // Filter out pull requests
      issues = issues.filter((i: any) => !i.pull_request);

      const files = [];
      for (const issue of issues) {
        const comments = await fetchAllComments(ctx.owner, ctx.repo, issue.number);
        const filePath = issueFilePath(args.path, issue.number);
        const content = serializeIssue(issue, comments);
        await Bun.write(filePath, content);
        files.push({ path: filePath, number: issue.number, title: issue.title });
      }

      return { path: args.path, files };
    },
  },
];
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/gh && bun build src/tools/issue-sync.ts --no-bundle 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issue-sync.ts
git commit -m "feat(gh): create issue-sync.ts with comment-aware issue_pull"
```

### Task 4: Add issue_push with comment sync to issue-sync.ts

**Files:**
- Modify: `plugins/gh/src/tools/issue-sync.ts`
- Reference: `plugins/gh/src/tools/issues.ts:234-314` (existing issue_push)

- [ ] **Step 1: Add issue_push tool to issue-sync.ts**

Add these imports at the top of `issue-sync.ts`:

```typescript
import { rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseIssueFile } from './issue-files.js';
```

Add the `issue_push` tool to the `tools` array:

```typescript
  {
    name: 'issue_push',
    description: 'Push local markdown issue files back to GitHub, syncing metadata, body, and comments',
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
          const { frontmatter, body, comments } = parseIssueFile(content);

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

            // Push any new comments on the new issue
            const pushedComments: any[] = [];
            for (const c of comments) {
              if (!c.id) {
                const posted = await api(
                  `/repos/${ctx.owner}/${ctx.repo}/issues/${created.number}/comments`,
                  { method: 'POST', body: { body: c.body } },
                );
                pushedComments.push(posted);
              }
            }

            // Reserialize with fresh data
            const allComments = await fetchAllComments(ctx.owner, ctx.repo, created.number);
            const serialized = serializeIssue(created, allComments);
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
            // Update existing issue metadata + body
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

            // Sync comments
            const skipped: string[] = [];
            const remoteComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);
            const remoteById = new Map(remoteComments.map((c: any) => [c.id, c]));

            for (const local of comments) {
              if (!local.id) {
                // New comment — create
                await api(
                  `/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}/comments`,
                  { method: 'POST', body: { body: local.body } },
                );
              } else {
                // Existing comment — check if edited
                const remote = remoteById.get(local.id);
                if (remote && remote.body !== local.body) {
                  try {
                    await api(
                      `/repos/${ctx.owner}/${ctx.repo}/issues/comments/${local.id}`,
                      { method: 'PATCH', body: { body: local.body } },
                    );
                  } catch (err: any) {
                    skipped.push(`comment ${local.id} by @${local.author}: ${err.message}`);
                  }
                }
              }
            }

            // Re-fetch and rewrite file with fresh state
            const freshComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);
            await Bun.write(filePath, serializeIssue(result, freshComments));

            const pushResult: any = {
              action: 'updated',
              number: result.number,
              title: result.title,
              html_url: result.html_url,
            };
            if (skipped.length > 0) pushResult.skipped = skipped;
            results.push(pushResult);
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
  },
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/gh && bun build src/tools/issue-sync.ts --no-bundle 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issue-sync.ts
git commit -m "feat(gh): add comment-aware issue_push to issue-sync.ts"
```

### Task 5: Add issue_diff with comment diffing to issue-sync.ts

**Files:**
- Modify: `plugins/gh/src/tools/issue-sync.ts`
- Reference: `plugins/gh/src/tools/issues.ts:315-413` (existing issue_diff)

- [ ] **Step 1: Add issue_diff tool to issue-sync.ts**

Add `unifiedDiff` to the imports from `issue-files.js`:

```typescript
import { serializeIssue, parseIssueFile, issueFilePath, resolveIssuePaths, unifiedDiff } from './issue-files.js';
```

Add the `issue_diff` tool to the `tools` array:

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
      const errors: any[] = [];

      for (const filePath of paths) {
        try {
          const content = await Bun.file(filePath).text();
          const { frontmatter, body, comments } = parseIssueFile(content);

          if (frontmatter.number === undefined) {
            errors.push({
              file: filePath.split('/').pop(),
              error: 'Skipped: new-issue file has no number (not yet pushed to GitHub)',
            });
            continue;
          }

          const remote = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`);
          const remoteComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);

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
            remoteBody, body,
            `a/issue-${frontmatter.number} (remote)`,
            `b/issue-${frontmatter.number} (local)`,
          );

          // Comment changes
          const commentChanges: any[] = [];
          const remoteById = new Map(remoteComments.map((c: any) => [c.id, c]));
          const localIds = new Set(comments.filter(c => c.id).map(c => c.id));

          // New local comments
          const newLocalComments = comments.filter(c => !c.id);
          if (newLocalComments.length > 0) {
            commentChanges.push({ type: 'new_local', count: newLocalComments.length });
          }

          // Edited comments
          for (const local of comments) {
            if (local.id) {
              const remote = remoteById.get(local.id);
              if (remote && remote.body !== local.body) {
                commentChanges.push({
                  type: 'edited',
                  id: local.id,
                  author: local.author,
                  diff: unifiedDiff(
                    remote.body, local.body,
                    `a/comment-${local.id} (remote)`,
                    `b/comment-${local.id} (local)`,
                  ),
                });
              }
            }
          }

          // New remote comments (not in local file)
          for (const rc of remoteComments) {
            if (!localIds.has(rc.id)) {
              commentChanges.push({
                type: 'new_remote',
                id: rc.id,
                author: rc.user?.login ?? 'unknown',
              });
            }
          }

          // Remote newer check
          const remoteNewer = frontmatter.pulled_at
            ? new Date(remote.updated_at) > new Date(frontmatter.pulled_at)
            : false;

          const hasChanges = changes.length > 0 || bodyDiff !== null || commentChanges.length > 0;
          const status = hasChanges ? 'modified' : 'up_to_date';

          diffs.push({
            number: frontmatter.number,
            title: frontmatter.title,
            status,
            changes,
            body_diff: bodyDiff,
            comment_changes: commentChanges.length > 0 ? commentChanges : undefined,
            remote_newer: remoteNewer,
          });
        } catch (err: any) {
          errors.push({
            file: filePath.split('/').pop(),
            error: err.message,
          });
        }
      }

      return errors.length > 0 ? { diffs, errors } : { diffs };
    },
  },
```

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/gh && bun build src/tools/issue-sync.ts --no-bundle 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/issue-sync.ts
git commit -m "feat(gh): add comment-aware issue_diff to issue-sync.ts"
```

### Task 6: Create issue-search.ts (local frontmatter search)

**Files:**
- Create: `plugins/gh/src/tools/issue-search.ts`
- Create: `plugins/gh/src/tools/issue-search.test.ts`

- [ ] **Step 1: Write failing test**

Create `plugins/gh/src/tools/issue-search.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { searchIssues } from './issue-search';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const tmpDir = join(import.meta.dir, '__test_tmp_search');

function issueFile(opts: {
  number: number; title: string; state: string;
  labels?: string[]; milestone?: number | null; assignees?: string[];
}) {
  const labels = (opts.labels ?? []).map(l => `  - ${l}`).join('\n');
  return `---
number: ${opts.number}
title: "${opts.title}"
state: ${opts.state}
labels:
${labels || '  []'}
milestone: ${opts.milestone ?? 'null'}
assignees:
${(opts.assignees ?? []).map(a => `  - ${a}`).join('\n') || '  []'}
---

Body of issue ${opts.number}.`;
}

describe('searchIssues', () => {
  test('filters by state (default open)', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'Open', state: 'open' }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'Closed', state: 'closed' }));

    const results = await searchIssues(tmpDir, {});
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);

    await rm(tmpDir, { recursive: true });
  });

  test('filters by labels (AND logic)', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'A', state: 'open', labels: ['bug', 'backlog'] }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'B', state: 'open', labels: ['bug'] }));

    const results = await searchIssues(tmpDir, { labels: 'bug,backlog' });
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);

    await rm(tmpDir, { recursive: true });
  });

  test('filters by milestone', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'A', state: 'open', milestone: 3 }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'B', state: 'open', milestone: null }));

    const withMilestone = await searchIssues(tmpDir, { milestone: '3' });
    expect(withMilestone).toHaveLength(1);
    expect(withMilestone[0].number).toBe(1);

    const noMilestone = await searchIssues(tmpDir, { milestone: 'none' });
    expect(noMilestone).toHaveLength(1);
    expect(noMilestone[0].number).toBe(2);

    await rm(tmpDir, { recursive: true });
  });

  test('filters by assignee', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'A', state: 'open', assignees: ['alice'] }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'B', state: 'open', assignees: [] }));

    const assigned = await searchIssues(tmpDir, { assignee: 'alice' });
    expect(assigned).toHaveLength(1);
    expect(assigned[0].number).toBe(1);

    const none = await searchIssues(tmpDir, { assignee: 'none' });
    expect(none).toHaveLength(1);
    expect(none[0].number).toBe(2);

    await rm(tmpDir, { recursive: true });
  });

  test('state=all returns everything', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), issueFile({ number: 1, title: 'Open', state: 'open' }));
    await writeFile(join(tmpDir, 'issue-2.md'), issueFile({ number: 2, title: 'Closed', state: 'closed' }));

    const results = await searchIssues(tmpDir, { state: 'all' });
    expect(results).toHaveLength(2);

    await rm(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd plugins/gh && bun test src/tools/issue-search.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement issue-search.ts**

Create `plugins/gh/src/tools/issue-search.ts`:

```typescript
import { z } from 'zod';
import type { ToolDef } from '../types.js';
import type { GhContext } from '../gh.js';
import { resolveIssuePaths, parseIssueFile } from './issue-files.js';

export interface SearchFilters {
  state?: string;
  labels?: string;
  milestone?: string;
  assignee?: string;
}

/**
 * Search local .issues/ files by frontmatter fields.
 * Exported separately for testing without MCP tool wiring.
 */
export async function searchIssues(
  dir: string,
  filters: SearchFilters,
): Promise<Array<{
  number?: number;
  title: string;
  state: string;
  labels: string[];
  milestone: number | null;
  assignees: string[];
  url?: string;
}>> {
  const paths = await resolveIssuePaths(dir);
  const results: any[] = [];

  const stateFilter = filters.state ?? 'open';
  const labelFilter = filters.labels ? filters.labels.split(',').map(l => l.trim()) : null;
  const milestoneFilter = filters.milestone ?? null;
  const assigneeFilter = filters.assignee ?? null;

  for (const filePath of paths) {
    try {
      const content = await Bun.file(filePath).text();
      const { frontmatter } = parseIssueFile(content);

      // State filter
      if (stateFilter !== 'all' && frontmatter.state !== stateFilter) continue;

      // Labels filter (AND — must have all specified labels)
      if (labelFilter) {
        const hasAll = labelFilter.every(l => frontmatter.labels.includes(l));
        if (!hasAll) continue;
      }

      // Milestone filter
      if (milestoneFilter !== null) {
        if (milestoneFilter === 'none') {
          if (frontmatter.milestone !== null) continue;
        } else {
          if (frontmatter.milestone !== parseInt(milestoneFilter)) continue;
        }
      }

      // Assignee filter
      if (assigneeFilter !== null) {
        if (assigneeFilter === 'none') {
          if (frontmatter.assignees.length > 0) continue;
        } else {
          if (!frontmatter.assignees.includes(assigneeFilter)) continue;
        }
      }

      results.push({
        number: frontmatter.number,
        title: frontmatter.title,
        state: frontmatter.state,
        labels: frontmatter.labels,
        milestone: frontmatter.milestone,
        assignees: frontmatter.assignees,
        url: frontmatter.url,
      });
    } catch {
      // Skip unparseable files
    }
  }

  return results;
}

export const tools: ToolDef[] = [
  {
    name: 'issue_search',
    description: 'Search local .issues/ files by frontmatter fields (state, labels, milestone, assignee)',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the .issues/ directory'),
      state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by state'),
      labels: z.string().optional().describe('Comma-separated label names (AND logic)'),
      milestone: z.string().optional().describe('Milestone number or "none"'),
      assignee: z.string().optional().describe('Username or "none"'),
    }),
    handler: async (args, _ctx: GhContext) => {
      return searchIssues(args.path, {
        state: args.state,
        labels: args.labels,
        milestone: args.milestone,
        assignee: args.assignee,
      });
    },
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd plugins/gh && bun test src/tools/issue-search.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/gh/src/tools/issue-search.ts plugins/gh/src/tools/issue-search.test.ts
git commit -m "feat(gh): add local frontmatter-based issue_search"
```

---

## Chunk 3: Server Update, Hooks, and Cleanup

### Task 7: Update server.ts to use new tool files

**Files:**
- Modify: `plugins/gh/src/server.ts`

- [ ] **Step 1: Replace imports and tool collection in server.ts**

Replace lines 15-30 of `server.ts` with:

```typescript
// Import tool modules — each exports an array of ToolDef
import { tools as issueSyncTools } from './tools/issue-sync.js';
import { tools as issueSearchTools } from './tools/issue-search.js';

// Collect all tools
const allTools: ToolDef[] = [
  ...issueSyncTools,
  ...issueSearchTools,
  ...repoTools,
];
```

- [ ] **Step 2: Add issue_search to the bypass list alongside detect_repo**

Replace lines 58-62 (the detect_repo special case) with:

```typescript
    // detect_repo and issue_search don't need resolveRepo()
    if (tool.name === 'detect_repo' || tool.name === 'issue_search') {
      const result = await tool.handler(args, {} as GhContext);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
```

- [ ] **Step 3: Verify MCP server starts**

Run: `cd plugins/gh && timeout 3 bun src/server.ts 2>&1 || true`
Expected: Server starts without import errors (will hang waiting for stdin, timeout is fine)

- [ ] **Step 4: Commit**

```bash
git add plugins/gh/src/server.ts
git commit -m "feat(gh): rewire server.ts to new tool files (5 tools)"
```

### Task 8: Update pull-existing hook for comments

**Files:**
- Modify: `plugins/gh/src/hooks/pull-existing.ts`

- [ ] **Step 1: Update pull-existing.ts to fetch and serialize comments**

Update the import line to also import `fetchAllComments`:

```typescript
import { detectRepo, api, fetchAllComments } from '../gh.js';
```

Replace the loop body (lines 58-70) where it fetches and serializes each issue. The full loop becomes:

```typescript
  for (const file of numbered) {
    try {
      const issue = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${file.number}`);
      if (issue.pull_request) {
        stats.warnings.push(`#${file.number}: is a pull request, skipped`);
        continue;
      }
      const comments = await fetchAllComments(ctx.owner, ctx.repo, file.number);
      const content = serializeIssue(issue, comments);
      await Bun.write(file.path, content);
      stats.pulled++;
    } catch (err: any) {
      stats.warnings.push(`#${file.number}: ${err.message}`);
    }
  }
```

- [ ] **Step 2: Verify compilation**

Run: `cd plugins/gh && bun build src/hooks/pull-existing.ts --no-bundle 2>&1 | head -5`
Expected: No errors (validates `serializeIssue` accepts 2 args and `fetchAllComments` is importable)

- [ ] **Step 3: Run existing hook tests**

Run: `cd plugins/gh && bun test src/hooks/pull-existing.test.ts`
Expected: PASS (tests only check `buildPullResult`, not the main function)

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/hooks/pull-existing.ts
git commit -m "feat(gh): update pull-existing hook to fetch comments"
```

### Task 9: Update push-changed hook for comments

**Files:**
- Modify: `plugins/gh/src/hooks/push-changed.ts`

- [ ] **Step 1: Update push-changed.ts numbered issue loop**

Add comment sync after the PATCH in the numbered issues loop. Replace lines 65-105 (the numbered issues loop):

```typescript
  // Push modified existing issues
  for (const file of numbered) {
    try {
      const content = await Bun.file(file.path).text();
      const { frontmatter, body, comments } = parseIssueFile(content);

      if (!frontmatter.number) continue;

      // Skip if not modified since last pull
      if (frontmatter.pulled_at && !(await isModifiedSince(file.path, frontmatter.pulled_at))) {
        continue;
      }

      // Conflict check
      const remote = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`);
      if (isRemoteNewer(remote.updated_at, frontmatter.pulled_at)) {
        stats.skipped.push(`#${frontmatter.number} (remote newer)`);
        continue;
      }

      // Push issue metadata + body
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

      // Sync comments
      const remoteComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);
      const remoteById = new Map(remoteComments.map((c: any) => [c.id, c]));

      for (const local of comments) {
        if (!local.id) {
          // New comment
          try {
            await api(
              `/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}/comments`,
              { method: 'POST', body: { body: local.body } },
            );
          } catch (err: any) {
            stats.skipped.push(`#${frontmatter.number} comment: ${err.message}`);
          }
        } else {
          // Edited comment
          const rc = remoteById.get(local.id);
          if (rc && rc.body !== local.body) {
            try {
              await api(
                `/repos/${ctx.owner}/${ctx.repo}/issues/comments/${local.id}`,
                { method: 'PATCH', body: { body: local.body } },
              );
            } catch (err: any) {
              stats.skipped.push(`comment ${local.id} by @${local.author}: ${err.message}`);
            }
          }
        }
      }

      // Rewrite file with fresh state including comments
      const freshComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);
      const refreshed = serializeIssue(updated, freshComments);
      await Bun.write(file.path, refreshed);
      stats.pushed++;
    } catch (err: any) {
      stats.skipped.push(`#${file.number} (${err.message})`);
    }
  }
```

Update the import line at the top of the file to import `fetchAllComments` from `gh.ts`:

```typescript
import { detectRepo, api, fetchAllComments } from '../gh.js';
```

- [ ] **Step 2: Update new-issues loop too**

Replace lines 108-140 (new issues loop). Add comment sync for new issues:

```typescript
  // Create new issues
  for (const file of newIssues) {
    try {
      const content = await Bun.file(file.path).text();
      const { frontmatter, body, comments } = parseIssueFile(content);

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

      // Post any comments
      for (const c of comments) {
        if (!c.id) {
          try {
            await api(
              `/repos/${ctx.owner}/${ctx.repo}/issues/${created.number}/comments`,
              { method: 'POST', body: { body: c.body } },
            );
          } catch (err: any) {
            stats.skipped.push(`${file.name} comment: ${err.message}`);
          }
        }
      }

      // Re-fetch with comments and rewrite
      const freshComments = await fetchAllComments(ctx.owner, ctx.repo, created.number);
      const serialized = serializeIssue(created, freshComments);
      await Bun.write(file.path, serialized);

      const newPath = join(dirname(file.path), `issue-${created.number}.md`);
      await rename(file.path, newPath);

      stats.created++;
    } catch (err: any) {
      stats.skipped.push(`${file.name} (${err.message})`);
    }
  }
```

- [ ] **Step 3: Verify compilation**

Run: `cd plugins/gh && bun build src/hooks/push-changed.ts --no-bundle 2>&1 | head -5`
Expected: No errors

- [ ] **Step 4: Run hook tests**

Run: `cd plugins/gh && bun test src/hooks/push-changed.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/gh/src/hooks/push-changed.ts
git commit -m "feat(gh): update push-changed hook for comment sync"
```

### Task 10: Delete old tool files and clean up dead code

**Files:**
- Delete: `plugins/gh/src/tools/issues.ts`
- Delete: `plugins/gh/src/tools/prs.ts`
- Delete: `plugins/gh/src/tools/labels.ts`
- Delete: `plugins/gh/src/tools/milestones.ts`
- Delete: `plugins/gh/src/tools/projects.ts`
- Modify: `plugins/gh/src/gh.ts` (remove `graphql`)
- Modify: `plugins/gh/src/types.ts` (remove `paginationParams`)

- [ ] **Step 1: Delete old tool files**

```bash
git rm plugins/gh/src/tools/issues.ts \
      plugins/gh/src/tools/prs.ts \
      plugins/gh/src/tools/labels.ts \
      plugins/gh/src/tools/milestones.ts \
      plugins/gh/src/tools/projects.ts
```

- [ ] **Step 2: Remove graphql function from gh.ts**

Remove lines 82-105 (the `graphql` function and its doc comment) from `gh.ts`.

- [ ] **Step 3: Remove paginationParams from types.ts**

Remove lines 9-12 (`paginationParams` export) from `types.ts`.

- [ ] **Step 4: Run all tests to verify nothing is broken**

Run: `cd plugins/gh && bun test`
Expected: ALL PASS

- [ ] **Step 5: Verify server still starts**

Run: `cd plugins/gh && timeout 3 bun src/server.ts 2>&1 || true`
Expected: No import errors

- [ ] **Step 6: Commit**

```bash
git add plugins/gh/src/gh.ts plugins/gh/src/types.ts
git commit -m "chore(gh): delete old tool files, remove graphql and paginationParams"
```

### Task 11: Update create-issue skill and plugin.json description

**Files:**
- Modify: `plugins/gh/skills/create-issue/SKILL.md`
- Modify: `plugins/gh/.claude-plugin/plugin.json`

- [ ] **Step 1: Update SKILL.md to mention comments**

Add a "Comments" section to `plugins/gh/skills/create-issue/SKILL.md` after the "Notes" section:

```markdown
## Adding comments to new issues

You can add comments to a new issue file before pushing. Append a `## Comments` section after the body:

```yaml
---
title: "New issue"
state: open
labels: []
---

Issue body here.

## Comments

### @username — new

First comment on the new issue.
```

Comments with `— new` headings will be posted as comments on the issue after it is created.
```

- [ ] **Step 2: Update plugin.json description**

Update the `description` in `plugins/gh/.claude-plugin/plugin.json` to:

```json
"description": "MCP server for GitHub CLI — issue pull/push/diff with comment sync and local search"
```

- [ ] **Step 3: Run marketplace generator**

```bash
./scripts/generate-marketplace.sh
```

- [ ] **Step 4: Commit**

```bash
git add plugins/gh/skills/create-issue/SKILL.md plugins/gh/.claude-plugin/plugin.json marketplace.json
git commit -m "docs(gh): update skill, plugin.json, and marketplace for slimdown"
```

### Task 12: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all plugin tests**

Run: `cd plugins/gh && bun test`
Expected: ALL PASS

- [ ] **Step 2: Verify server starts and lists 5 tools**

Run: `cd plugins/gh && echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 5 bun src/server.ts 2>/dev/null | jq '.result.tools | length'`
Expected: `5`

- [ ] **Step 3: Verify tool names**

Run: `cd plugins/gh && echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | timeout 5 bun src/server.ts 2>/dev/null | jq '.result.tools[].name'`
Expected: `detect_repo`, `issue_pull`, `issue_push`, `issue_diff`, `issue_search`

- [ ] **Step 4: Commit any fixes if needed, then final commit**

If all passes:
```bash
git log --oneline -10
```

Review commit history looks clean.
