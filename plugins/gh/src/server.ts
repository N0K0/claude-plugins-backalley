#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { checkGh, resolveRepo } from './gh.js';
import { getDefaultRepo } from './state.js';
import { tools as repoTools } from './tools/repo.js';
import type { GhContext } from './gh.js';
import type { ToolDef } from './types.js';

// Import tool modules — each exports an array of ToolDef
import { tools as issueSyncTools } from './tools/issue-sync.js';
import { tools as issueSearchTools } from './tools/issue-search.js';

// Collect all tools
const allTools: ToolDef[] = [
  ...issueSyncTools,
  ...issueSearchTools,
  ...repoTools,
];

// --- Startup ---
await checkGh();

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

    // detect_repo and issue_search don't need resolveRepo()
    if (tool.name === 'detect_repo' || tool.name === 'issue_search') {
      const result = await tool.handler(args, {} as GhContext);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    const ctx = resolveRepo(getDefaultRepo(), args);
    const result = await tool.handler(args, ctx);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
