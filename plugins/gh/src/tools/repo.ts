import { z } from 'zod';
import { detectRepo } from '../gh.js';
import { setDefaultRepo } from '../state.js';
import type { ToolDef } from '../types.js';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export const tools: ToolDef[] = [
  {
    name: 'detect_repo',
    description:
      'Detect the GitHub repository at a given directory path and set it as the default for subsequent tool calls. Call this once with your project path before using other tools.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Absolute path to a directory inside a git repo with a GitHub remote'),
    }),
    handler: async (args) => {
      if (!isAbsolute(args.path)) {
        throw new Error(`Path must be absolute, got: ${args.path}`);
      }
      if (!existsSync(args.path)) {
        throw new Error(`Directory not found: ${args.path}`);
      }
      if (!statSync(args.path).isDirectory()) {
        throw new Error(`Path is not a directory: ${args.path}`);
      }
      const ctx = await detectRepo(args.path);
      setDefaultRepo(ctx);
      return { ...ctx, cached: true };
    },
  },
];
