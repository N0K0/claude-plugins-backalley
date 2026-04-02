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
