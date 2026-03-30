import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
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
  return join(dir, `issue-${number}.md`);
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
  if (typeof frontmatter.number !== 'number') {
    throw new Error('Invalid issue file: missing "number" in frontmatter');
  }

  // Trim trailing newline added by serializeIssue
  const body = match[2].replace(/\n$/, '');

  return { frontmatter, body };
}

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
            const trailingContext = hunkLines.filter((_l, i) => {
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
