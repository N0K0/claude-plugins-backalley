import { z } from 'zod';
import { api } from '../gh.js';
import { repoParams, type ToolDef } from '../types.js';

export const tools: ToolDef[] = [
  {
    name: 'label_create',
    description: 'Create a repository label',
    inputSchema: z.object({
      ...repoParams,
      name: z.string().describe('Label name'),
      color: z.string().describe('Hex color without # (e.g. "FF0000")'),
      description: z.string().optional().describe('Label description'),
    }),
    handler: async (args, ctx) => {
      return api(`/repos/${ctx.owner}/${ctx.repo}/labels`, {
        method: 'POST',
        body: { name: args.name, color: args.color, description: args.description },
      });
    },
  },
  {
    name: 'label_list',
    description: 'List all labels in the repository',
    inputSchema: z.object({
      ...repoParams,
    }),
    handler: async (_args, ctx) => {
      return api(`/repos/${ctx.owner}/${ctx.repo}/labels`, {
        fields: { per_page: '100' },
      });
    },
  },
  {
    name: 'label_delete',
    description: 'Delete a repository label',
    inputSchema: z.object({
      ...repoParams,
      name: z.string().describe('Label name to delete'),
    }),
    handler: async (args, ctx) => {
      return api(`/repos/${ctx.owner}/${ctx.repo}/labels/${encodeURIComponent(args.name)}`, {
        method: 'DELETE',
      });
    },
  },
];
