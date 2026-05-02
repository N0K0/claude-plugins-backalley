import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot, findIssueFiles } from './shared.js';
import { detectRepo, api, fetchAllComments } from '../gh.js';
import { serializeIssue, ensureSlugPath } from '../tools/issue-files.js';

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
      const comments = await fetchAllComments(ctx.owner, ctx.repo, file.number);
      const content = serializeIssue(issue, comments);
      const filePath = await ensureSlugPath(issuesDir, file.number, issue.title, file.path);
      await Bun.write(filePath, content);
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
