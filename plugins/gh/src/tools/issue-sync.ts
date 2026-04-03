import { z } from 'zod';
import { api, fetchAllComments } from '../gh.js';
import { repoParams, type ToolDef } from '../types.js';
import { mkdir } from 'node:fs/promises';
import { serializeIssue, issueFilePath } from './issue-files.js';

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
