import { z } from 'zod';
import { api } from '../gh.js';
import { repoParams, type ToolDef } from '../types.js';

export const tools: ToolDef[] = [
  {
    name: 'milestone_create',
    description: 'Create a repository milestone',
    inputSchema: z.object({
      ...repoParams,
      title: z.string().describe('Milestone title'),
      description: z.string().optional().describe('Milestone description'),
      due_on: z.string().optional().describe('Due date (ISO 8601: YYYY-MM-DDTHH:MM:SSZ)'),
    }),
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = { title: args.title };
      if (args.description) body.description = args.description;
      if (args.due_on) body.due_on = args.due_on;
      return api(`/repos/${ctx.owner}/${ctx.repo}/milestones`, {
        method: 'POST',
        body,
      });
    },
  },
  {
    name: 'milestone_list',
    description: 'List milestones in the repository',
    inputSchema: z.object({
      ...repoParams,
      state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by state'),
    }),
    handler: async (args, ctx) => {
      return api(`/repos/${ctx.owner}/${ctx.repo}/milestones`, {
        fields: { state: args.state ?? 'open', per_page: '100' },
      });
    },
  },
  {
    name: 'milestone_update',
    description: 'Update a milestone',
    inputSchema: z.object({
      ...repoParams,
      milestone_number: z.number().describe('Milestone number'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      state: z.enum(['open', 'closed']).optional().describe('Milestone state'),
      due_on: z.string().nullable().optional().describe('Due date (null to remove)'),
    }),
    handler: async (args, ctx) => {
      const { milestone_number, owner, repo, ...body } = args;
      return api(`/repos/${ctx.owner}/${ctx.repo}/milestones/${milestone_number}`, {
        method: 'PATCH',
        body,
      });
    },
  },
];
