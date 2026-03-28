#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { checkGh, detectRepo, resolveRepo } from './gh.js';
import type { GhContext } from './gh.js';
import type { ToolDef } from './types.js';

// Import tool modules — each exports an array of ToolDef
import { tools as issueTools } from './tools/issues.js';
import { tools as labelTools } from './tools/labels.js';
import { tools as milestoneTools } from './tools/milestones.js';
import { tools as projectTools } from './tools/projects.js';
import { tools as prTools } from './tools/prs.js';

// Collect all tools
const allTools: ToolDef[] = [
  ...issueTools,
  ...labelTools,
  ...milestoneTools,
  ...projectTools,
  ...prTools,
];

// --- Startup ---
await checkGh();
const defaultRepo: GhContext = await detectRepo();
process.stderr.write(`gh plugin: detected repo ${defaultRepo.owner}/${defaultRepo.repo}\n`);

// --- MCP Server ---
const server = new Server(
  { name: 'gh', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = allTools.find(t => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
  }

  try {
    const args = tool.inputSchema.parse(req.params.arguments ?? {});
    const ctx = resolveRepo(defaultRepo, args);
    const result = await tool.handler(args, ctx);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
