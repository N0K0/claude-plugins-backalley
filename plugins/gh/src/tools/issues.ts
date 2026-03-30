import { z } from 'zod';
import { api } from '../gh.js';
import { repoParams, paginationParams, slim, type ToolDef } from '../types.js';
import { mkdir } from 'node:fs/promises';
import { serializeIssue, issueFilePath } from './issue-files.js';

const ISSUE_FIELDS = ['number', 'title', 'state', 'body', 'labels', 'milestone', 'assignees', 'html_url', 'created_at', 'updated_at', 'closed_at', 'user', 'node_id'];
const ISSUE_LIST_FIELDS = ['number', 'title', 'state', 'labels', 'milestone', 'assignees', 'html_url', 'created_at'];
const COMMENT_FIELDS = ['id', 'body', 'user', 'created_at', 'html_url'];

function slimIssue(issue: any) {
  const result = slim(issue, ISSUE_FIELDS);
  if (result.labels) result.labels = result.labels.map((l: any) => l.name ?? l);
  if (result.milestone) result.milestone = { number: result.milestone.number, title: result.milestone.title };
  if (result.assignees) result.assignees = result.assignees.map((a: any) => a.login ?? a);
  if (result.user) result.user = result.user.login ?? result.user;
  return result;
}

function slimIssueList(issue: any) {
  const result = slim(issue, ISSUE_LIST_FIELDS);
  if (result.labels) result.labels = result.labels.map((l: any) => l.name ?? l);
  if (result.milestone) result.milestone = { number: result.milestone.number, title: result.milestone.title };
  if (result.assignees) result.assignees = result.assignees.map((a: any) => a.login ?? a);
  return result;
}

export const tools: ToolDef[] = [
  {
    name: 'issue_create',
    description: 'Create a new GitHub issue',
    inputSchema: z.object({
      ...repoParams,
      title: z.string().describe('Issue title'),
      body: z.string().optional().describe('Issue body (markdown)'),
      labels: z.array(z.string()).optional().describe('Label names to apply'),
      milestone: z.number().optional().describe('Milestone number'),
      assignees: z.array(z.string()).optional().describe('GitHub usernames to assign'),
    }),
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = { title: args.title };
      if (args.body) body.body = args.body;
      if (args.labels) body.labels = args.labels;
      if (args.milestone) body.milestone = args.milestone;
      if (args.assignees) body.assignees = args.assignees;
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/issues`, {
        method: 'POST',
        body,
      });
      return slimIssue(result);
    },
  },
  {
    name: 'issue_update',
    description: 'Update an existing GitHub issue',
    inputSchema: z.object({
      ...repoParams,
      issue_number: z.number().describe('Issue number'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body'),
      state: z.enum(['open', 'closed']).optional().describe('Issue state'),
      labels: z.array(z.string()).optional().describe('Replace labels'),
      milestone: z.number().nullable().optional().describe('Milestone number (null to remove)'),
      assignees: z.array(z.string()).optional().describe('Replace assignees'),
    }),
    handler: async (args, ctx) => {
      const { issue_number, owner, repo, ...body } = args;
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${issue_number}`, {
        method: 'PATCH',
        body,
      });
      return slimIssue(result);
    },
  },
  {
    name: 'issue_get',
    description: 'Get details of a GitHub issue',
    inputSchema: z.object({
      ...repoParams,
      issue_number: z.number().describe('Issue number'),
    }),
    handler: async (args, ctx) => {
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}`);
      return slimIssue(result);
    },
  },
  {
    name: 'issue_list',
    description: 'List issues in the repository',
    inputSchema: z.object({
      ...repoParams,
      ...paginationParams,
      state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by state'),
      labels: z.string().optional().describe('Comma-separated label names'),
      milestone: z.string().optional().describe('Milestone number or "none"/"*"'),
      assignee: z.string().optional().describe('Username or "none"'),
    }),
    handler: async (args, ctx) => {
      const fields: Record<string, string> = {
        state: args.state ?? 'open',
        per_page: String(args.per_page ?? 30),
      };
      if (args.labels) fields.labels = args.labels;
      if (args.milestone) fields.milestone = args.milestone;
      if (args.assignee) fields.assignee = args.assignee;
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/issues`, { fields });
      return Array.isArray(result) ? result.map(slimIssueList) : result;
    },
  },
  {
    name: 'issue_search',
    description: 'Search issues using GitHub query syntax (e.g. "is:open label:bug")',
    inputSchema: z.object({
      ...repoParams,
      ...paginationParams,
      query: z.string().describe('GitHub search query'),
    }),
    handler: async (args, ctx) => {
      const fullQuery = `repo:${ctx.owner}/${ctx.repo} ${args.query}`;
      const result = await api(`/search/issues`, {
        fields: {
          q: fullQuery,
          per_page: String(args.per_page ?? 30),
        },
      });
      return {
        total_count: result.total_count,
        items: result.items?.map(slimIssueList) ?? [],
      };
    },
  },
  {
    name: 'issue_comment',
    description: 'Add a comment to a GitHub issue',
    inputSchema: z.object({
      ...repoParams,
      issue_number: z.number().describe('Issue number'),
      body: z.string().describe('Comment body (markdown)'),
    }),
    handler: async (args, ctx) => {
      const result = await api(
        `/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}/comments`,
        { method: 'POST', body: { body: args.body } }
      );
      const slimmed = slim(result, COMMENT_FIELDS);
      if (slimmed.user) slimmed.user = slimmed.user.login ?? slimmed.user;
      return slimmed;
    },
  },
  {
    name: 'issue_pull',
    description: 'Pull GitHub issues to local markdown files with YAML frontmatter for token-efficient editing',
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
        // Single issue fetch
        const issue = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}`);
        issues = [issue];
      } else {
        // Bulk fetch with pagination
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

      const files = [];
      for (const issue of issues) {
        const filePath = issueFilePath(args.path, issue.number);
        const content = serializeIssue(issue);
        await Bun.write(filePath, content);
        files.push({ path: filePath, number: issue.number, title: issue.title });
      }

      return { path: args.path, files };
    },
  },
];
