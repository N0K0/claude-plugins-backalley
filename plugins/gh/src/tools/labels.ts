import { z } from 'zod';
import { api } from '../gh.js';
import { repoParams, slim, type ToolDef } from '../types.js';

const LABEL_FIELDS = ['name', 'color', 'description'];

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
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/labels`, {
        method: 'POST',
        body: { name: args.name, color: args.color, description: args.description },
      });
      return slim(result, LABEL_FIELDS);
    },
  },
  {
    name: 'label_list',
    description: 'List all labels in the repository',
    inputSchema: z.object({
      ...repoParams,
    }),
    handler: async (_args, ctx) => {
      const result = await api(`/repos/${ctx.owner}/${ctx.repo}/labels`, {
        fields: { per_page: '100' },
      });
      return Array.isArray(result) ? slim(result, LABEL_FIELDS) : result;
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
      await api(`/repos/${ctx.owner}/${ctx.repo}/labels/${encodeURIComponent(args.name)}`, {
        method: 'DELETE',
      });
      return { deleted: args.name };
    },
  },
];
