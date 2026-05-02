import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

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
    if (parent === dir) return null;
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
    const numMatch = name.match(/^issue-(\d+)(?:-[^/]*)?\.md$/);
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
 */
export async function isModifiedSince(filePath: string, pulledAt: string): Promise<boolean> {
  const s = await stat(filePath);
  return s.mtimeMs > new Date(pulledAt).getTime();
}
