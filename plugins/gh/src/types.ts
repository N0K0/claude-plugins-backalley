import { z } from 'zod';

/** Optional owner/repo override — present on every tool */
export const repoParams = {
  owner: z.string().optional().describe('Repository owner (defaults to current repo)'),
  repo: z.string().optional().describe('Repository name (defaults to current repo)'),
};

/** Pagination param */
export const paginationParams = {
  per_page: z.number().optional().default(30).describe('Results per page (max 100)'),
};

/** Tool definition shape for registration */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: any, ctx: import('./gh.js').GhContext) => Promise<any>;
}
