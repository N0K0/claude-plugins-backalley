import { describe, test, expect } from 'bun:test';
import { parseIssueFile, serializeIssue, serializeComments, resolveIssuePaths, slugifyTitle, issueFilePath, ensureLocation, Comment } from './issue-files';
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

describe('resolveIssuePaths', () => {
  const tmpDir = join(import.meta.dir, '__test_tmp_resolve');

  test('includes legacy, slug-form, and new-issue files from directory', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-1.md'), '---\ntitle: "One"\n---\n\n');
    await writeFile(join(tmpDir, 'issue-2-some-title.md'), '---\ntitle: "Two"\n---\n\n');
    await writeFile(join(tmpDir, 'issue-10-other-thing.md'), '---\ntitle: "Ten"\n---\n\n');
    await writeFile(join(tmpDir, 'issue-new.md'), '---\ntitle: "New"\n---\n\n');
    await writeFile(join(tmpDir, 'issue-new-auth.md'), '---\ntitle: "Auth"\n---\n\n');
    await writeFile(join(tmpDir, 'README.md'), 'ignore me');

    const paths = await resolveIssuePaths(tmpDir);
    const names = paths.map(p => p.split('/').pop());

    // Numbered files sorted by number, then new-issue files sorted alphabetically
    expect(names).toEqual([
      'issue-1.md',
      'issue-2-some-title.md',
      'issue-10-other-thing.md',
      'issue-new-auth.md',
      'issue-new.md',
    ]);

    await rm(tmpDir, { recursive: true });
  });

  test('returns single file path when given a file', async () => {
    await mkdir(tmpDir, { recursive: true });
    const f = join(tmpDir, 'issue-5-my-issue.md');
    await writeFile(f, '---\ntitle: "Five"\n---\n\n');
    const paths = await resolveIssuePaths(f);
    expect(paths).toEqual([f]);
    await rm(tmpDir, { recursive: true });
  });

  test('includes issues from closed/ subfolder, sorted by number across both folders', async () => {
    await mkdir(join(tmpDir, 'closed'), { recursive: true });
    await writeFile(join(tmpDir, 'issue-1-open.md'), '');
    await writeFile(join(tmpDir, 'issue-4-open.md'), '');
    await writeFile(join(tmpDir, 'closed', 'issue-2-done.md'), '');
    await writeFile(join(tmpDir, 'closed', 'issue-3-fixed.md'), '');

    const paths = await resolveIssuePaths(tmpDir);
    const names = paths.map(p => p.split('/').pop());
    expect(names).toEqual(['issue-1-open.md', 'issue-2-done.md', 'issue-3-fixed.md', 'issue-4-open.md']);

    await rm(tmpDir, { recursive: true });
  });
});

describe('slugifyTitle', () => {
  test('lowercases and hyphenates words', () => {
    expect(slugifyTitle('Fix the Login Bug')).toBe('fix-the-login-bug');
  });

  test('collapses runs of non-alphanumeric characters', () => {
    expect(slugifyTitle('Add feat: (new API) — fast!')).toBe('add-feat-new-api-fast');
  });

  test('trims leading and trailing hyphens', () => {
    expect(slugifyTitle('---hello---')).toBe('hello');
  });

  test('caps at 50 chars and trims trailing hyphen', () => {
    const long = 'a'.repeat(48) + '-b';
    const result = slugifyTitle(long);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).not.toMatch(/-$/);
  });

  test('returns empty string for title that has no alphanumeric characters', () => {
    expect(slugifyTitle('!!!---!!!')).toBe('');
  });

  test('strips non-ASCII characters', () => {
    expect(slugifyTitle('Ünïcödé fix')).toBe('n-c-d-fix');
  });
});

describe('issueFilePath', () => {
  test('includes slug when title provided', () => {
    expect(issueFilePath('/dir', 5, 'My Cool Bug')).toBe('/dir/issue-5-my-cool-bug.md');
  });

  test('omits slug when no title', () => {
    expect(issueFilePath('/dir', 5)).toBe('/dir/issue-5.md');
  });

  test('omits slug when title slugifies to empty', () => {
    expect(issueFilePath('/dir', 5, '!!!')).toBe('/dir/issue-5.md');
  });
});

describe('ensureLocation', () => {
  const tmpDir = join(import.meta.dir, '__test_tmp_slug');

  test('renames legacy issue-{N}.md to slug form (open)', async () => {
    await mkdir(tmpDir, { recursive: true });
    const legacy = join(tmpDir, 'issue-7.md');
    await writeFile(legacy, 'content');

    const result = await ensureLocation(tmpDir, 7, 'My Feature', 'open');
    expect(result).toBe(join(tmpDir, 'issue-7-my-feature.md'));

    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(tmpDir);
    expect(entries).toContain('issue-7-my-feature.md');
    expect(entries).not.toContain('issue-7.md');

    await rm(tmpDir, { recursive: true });
  });

  test('renames stale-slug file when title changes (open)', async () => {
    await mkdir(tmpDir, { recursive: true });
    const stale = join(tmpDir, 'issue-3-old-title.md');
    await writeFile(stale, 'content');

    const result = await ensureLocation(tmpDir, 3, 'New Title', 'open', stale);
    expect(result).toBe(join(tmpDir, 'issue-3-new-title.md'));

    await rm(tmpDir, { recursive: true });
  });

  test('is a no-op when filename already matches (open)', async () => {
    await mkdir(tmpDir, { recursive: true });
    const correct = join(tmpDir, 'issue-9-correct.md');
    await writeFile(correct, 'content');

    const result = await ensureLocation(tmpDir, 9, 'correct', 'open', correct);
    expect(result).toBe(correct);

    await rm(tmpDir, { recursive: true });
  });

  test('moves top-level file to closed/ when state is closed', async () => {
    await mkdir(tmpDir, { recursive: true });
    const top = join(tmpDir, 'issue-5-fix-bug.md');
    await writeFile(top, 'content');

    const result = await ensureLocation(tmpDir, 5, 'fix bug', 'closed');
    expect(result).toBe(join(tmpDir, 'closed', 'issue-5-fix-bug.md'));

    const { readdir } = await import('node:fs/promises');
    const topEntries = await readdir(tmpDir);
    expect(topEntries).not.toContain('issue-5-fix-bug.md');
    const closedEntries = await readdir(join(tmpDir, 'closed'));
    expect(closedEntries).toContain('issue-5-fix-bug.md');

    await rm(tmpDir, { recursive: true });
  });

  test('moves file from closed/ back to top level when state is open', async () => {
    await mkdir(join(tmpDir, 'closed'), { recursive: true });
    const closedPath = join(tmpDir, 'closed', 'issue-8-reopen-me.md');
    await writeFile(closedPath, 'content');

    const result = await ensureLocation(tmpDir, 8, 'reopen me', 'open');
    expect(result).toBe(join(tmpDir, 'issue-8-reopen-me.md'));

    const { readdir } = await import('node:fs/promises');
    const topEntries = await readdir(tmpDir);
    expect(topEntries).toContain('issue-8-reopen-me.md');
    const closedEntries = await readdir(join(tmpDir, 'closed'));
    expect(closedEntries).not.toContain('issue-8-reopen-me.md');

    await rm(tmpDir, { recursive: true });
  });

  test('is a no-op when closed file is already at correct closed path', async () => {
    await mkdir(join(tmpDir, 'closed'), { recursive: true });
    const closedPath = join(tmpDir, 'closed', 'issue-4-done.md');
    await writeFile(closedPath, 'content');

    const result = await ensureLocation(tmpDir, 4, 'done', 'closed', closedPath);
    expect(result).toBe(closedPath);

    await rm(tmpDir, { recursive: true });
  });

  test('creates closed/ directory when it does not exist and moves file into it', async () => {
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'issue-11-new-closed.md'), 'content');

    const result = await ensureLocation(tmpDir, 11, 'new closed', 'closed');
    expect(result).toBe(join(tmpDir, 'closed', 'issue-11-new-closed.md'));

    const { readdir } = await import('node:fs/promises');
    const closedEntries = await readdir(join(tmpDir, 'closed'));
    expect(closedEntries).toContain('issue-11-new-closed.md');

    await rm(tmpDir, { recursive: true });
  });
});

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
      number: 1, title: 'No comments', state: 'open',
      labels: [], milestone: null, assignees: [],
      html_url: 'https://github.com/owner/repo/issues/1', body: 'Body.',
    };
    const result = serializeIssue(raw, []);
    expect(result).not.toContain('## Comments');
  });

  test('backward compat: serializeIssue without comments arg', () => {
    const raw = {
      number: 1, title: 'Compat', state: 'open',
      labels: [], milestone: null, assignees: [],
      html_url: 'https://github.com/owner/repo/issues/1', body: 'Body.',
    };
    const result = serializeIssue(raw);
    expect(result).not.toContain('## Comments');
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
});

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
