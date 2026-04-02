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
