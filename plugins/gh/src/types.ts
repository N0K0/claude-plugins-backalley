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

/**
 * Pick only the specified keys from an object.
 * Works on single objects and arrays.
 */
export function slim<T extends Record<string, any>>(data: T, keys: string[]): Partial<T>;
export function slim<T extends Record<string, any>>(data: T[], keys: string[]): Partial<T>[];
export function slim(data: any, keys: string[]): any {
  if (Array.isArray(data)) {
    return data.map((item: any) => slim(item, keys));
  }
  if (!data || typeof data !== 'object') return data;
  const result: Record<string, any> = {};
  for (const key of keys) {
    if (key in data) {
      result[key] = data[key];
    }
  }
  return result;
}
