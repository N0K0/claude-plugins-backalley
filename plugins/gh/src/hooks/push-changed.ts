import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
