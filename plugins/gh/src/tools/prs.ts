import { z } from 'zod';
import { api } from '../gh.js';
import { repoParams, paginationParams, type ToolDef } from '../types.js';

export const tools: ToolDef[] = [
  {
    name: 'pr_create',
    description: 'Create a pull request',
    inputSchema: z.object({
      ...repoParams,
      title: z.string().describe('PR title'),
      body: z.string().optional().describe('PR body (markdown)'),
      head: z.string().describe('Branch containing changes'),
      base: z.string().optional().default('main').describe('Branch to merge into (default: main)'),
      reviewers: z.array(z.string()).optional().describe('Reviewer usernames'),
    }),
    handler: async (args, ctx) => {
      const pr = await api(`/repos/${ctx.owner}/${ctx.repo}/pulls`, {
        method: 'POST',
        body: {
          title: args.title,
          body: args.body,
          head: args.head,
          base: args.base ?? 'main',
        },
      });

      // Request reviewers separately if specified
      if (args.reviewers?.length) {
        await api(`/repos/${ctx.owner}/${ctx.repo}/pulls/${pr.number}/requested_reviewers`, {
          method: 'POST',
          body: { reviewers: args.reviewers },
        });
      }

      return pr;
    },
  },
  {
    name: 'pr_list',
    description: 'List pull requests',
    inputSchema: z.object({
      ...repoParams,
      ...paginationParams,
      state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by state'),
      base: z.string().optional().describe('Filter by base branch'),
      head: z.string().optional().describe('Filter by head branch (user:branch format)'),
    }),
    handler: async (args, ctx) => {
      const fields: Record<string, string> = {
        state: args.state ?? 'open',
        per_page: String(args.per_page ?? 30),
      };
      if (args.base) fields.base = args.base;
      if (args.head) fields.head = args.head;
      return api(`/repos/${ctx.owner}/${ctx.repo}/pulls`, { fields });
    },
  },
  {
    name: 'pr_get',
    description: 'Get details of a pull request',
    inputSchema: z.object({
      ...repoParams,
      pr_number: z.number().describe('PR number'),
    }),
    handler: async (args, ctx) => {
      return api(`/repos/${ctx.owner}/${ctx.repo}/pulls/${args.pr_number}`);
    },
  },
  {
    name: 'pr_merge',
    description: 'Merge a pull request',
    inputSchema: z.object({
      ...repoParams,
      pr_number: z.number().describe('PR number'),
      merge_method: z.enum(['merge', 'squash', 'rebase']).optional().default('merge').describe('Merge strategy'),
    }),
    handler: async (args, ctx) => {
      return api(`/repos/${ctx.owner}/${ctx.repo}/pulls/${args.pr_number}/merge`, {
        method: 'PUT',
        body: { merge_method: args.merge_method ?? 'merge' },
      });
    },
  },
  {
    name: 'pr_review_request',
    description: 'Request reviewers for a pull request',
    inputSchema: z.object({
      ...repoParams,
      pr_number: z.number().describe('PR number'),
      reviewers: z.array(z.string()).describe('Reviewer usernames'),
    }),
    handler: async (args, ctx) => {
      return api(
        `/repos/${ctx.owner}/${ctx.repo}/pulls/${args.pr_number}/requested_reviewers`,
        { method: 'POST', body: { reviewers: args.reviewers } }
      );
    },
  },
];
