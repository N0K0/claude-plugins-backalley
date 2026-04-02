import { describe, test, expect } from 'bun:test';
import { findProjectRoot, findIssueFiles, isModifiedSince } from './shared';
import { mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

describe('findProjectRoot', () => {
  test('finds .git in ancestor directory', () => {
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
    const pastDate = new Date(Date.now() - 3600_000).toISOString();
    expect(await isModifiedSince(f, pastDate)).toBe(true);
    await rm(tmpDir, { recursive: true });
  });

  test('returns false when file mtime is before pulled_at', async () => {
    await mkdir(tmpDir, { recursive: true });
    const f = join(tmpDir, 'test.md');
    await writeFile(f, 'content');
    const past = new Date(Date.now() - 3600_000);
    await utimes(f, past, past);
    const now = new Date().toISOString();
    expect(await isModifiedSince(f, now)).toBe(false);
    await rm(tmpDir, { recursive: true });
  });
});
