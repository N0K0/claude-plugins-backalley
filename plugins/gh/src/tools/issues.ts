import { z } from 'zod';
import { api } from '../gh.js';
import { repoParams, paginationParams, type ToolDef } from '../types.js';

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
      return api(`/repos/${ctx.owner}/${ctx.repo}/issues`, {
        method: 'POST',
        body,
      });
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
      return api(`/repos/${ctx.owner}/${ctx.repo}/issues/${issue_number}`, {
        method: 'PATCH',
        body,
      });
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
      return api(`/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}`);
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
      return api(`/repos/${ctx.owner}/${ctx.repo}/issues`, { fields });
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
      return api(`/search/issues`, {
        fields: {
          q: fullQuery,
          per_page: String(args.per_page ?? 30),
        },
      });
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
      return api(
        `/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}/comments`,
        { method: 'POST', body: { body: args.body } }
      );
    },
  },
];
