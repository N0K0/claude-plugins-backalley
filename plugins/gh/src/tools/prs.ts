import { z } from 'zod';
import { api } from '../gh.js';
import { repoParams, paginationParams, slim, type ToolDef } from '../types.js';

const PR_FIELDS = ['number', 'title', 'state', 'body', 'head', 'base', 'html_url', 'merged', 'mergeable', 'draft', 'user', 'labels', 'milestone', 'created_at', 'updated_at', 'node_id'];
const PR_LIST_FIELDS = ['number', 'title', 'state', 'head', 'base', 'html_url', 'draft', 'user', 'labels', 'created_at'];

function slimPr(pr: any) {
  const result = slim(pr, PR_FIELDS);
  if (result.head) result.head = { ref: result.head.ref, sha: result.head.sha };
  if (result.base) result.base = { ref: result.base.ref };
  if (result.user) result.user = result.user.login ?? result.user;
  if (result.labels) result.labels = result.labels.map((l: any) => l.name ?? l);
  if (result.milestone) result.milestone = { number: result.milestone.number, title: result.milestone.title };
  return result;
}

function slimPrList(pr: any) {
  const result = slim(pr, PR_LIST_FIELDS);
  if (result.head) result.head = { ref: result.head.ref };
  if (result.base) result.base = { ref: result.base.ref };
  if (result.user) result.user = result.user.login ?? result.user;
  if (result.labels) result.labels = result.labels.map((l: any) => l.name ?? l);
  return result;
}

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

      if (args.reviewers?.length) {
        await api(`/repos/${ctx.owner}/${ctx.repo}/pulls/${pr.number}/requested_reviewers`, {
          method: 'POST',
          body: { reviewers: args.reviewers },
        });
      }

      return slimPr(pr);
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
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/pulls`, { fields });
      return Array.isArray(result) ? result.map(slimPrList) : result;
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
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/pulls/${args.pr_number}`);
      return slimPr(result);
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
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/pulls/${args.pr_number}/merge`, {
        method: 'PUT',
        body: { merge_method: args.merge_method ?? 'merge' },
      });
      return slim(result, ['sha', 'merged', 'message']);
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
      await api(
        `/repos/${ctx.owner}/${ctx.repo}/pulls/${args.pr_number}/requested_reviewers`,
        { method: 'POST', body: { reviewers: args.reviewers } }
      );
      return { pr_number: args.pr_number, reviewers_requested: args.reviewers };
    },
  },
];
