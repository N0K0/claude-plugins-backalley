import { z } from 'zod';
import type { ToolDef } from '../types.js';
import type { GhContext } from '../gh.js';
import { resolveIssuePaths, parseIssueFile } from './issue-files.js';

export interface SearchFilters {
  state?: string;
  labels?: string;
  milestone?: string;
  assignee?: string;
}

/**
 * Search local .issues/ files by frontmatter fields.
 * Exported separately for testing without MCP tool wiring.
 */
export async function searchIssues(
  dir: string,
  filters: SearchFilters,
): Promise<Array<{
  number?: number;
  title: string;
  state: string;
  labels: string[];
  milestone: number | null;
  assignees: string[];
  url?: string;
}>> {
  const paths = await resolveIssuePaths(dir);
  const results: any[] = [];

  const stateFilter = filters.state ?? 'open';
  const labelFilter = filters.labels ? filters.labels.split(',').map(l => l.trim()) : null;
  const milestoneFilter = filters.milestone ?? null;
  const assigneeFilter = filters.assignee ?? null;

  for (const filePath of paths) {
    try {
      const content = await Bun.file(filePath).text();
      const { frontmatter } = parseIssueFile(content);

      // State filter
      if (stateFilter !== 'all' && frontmatter.state !== stateFilter) continue;

      // Labels filter (AND — must have all specified labels)
      if (labelFilter) {
        const hasAll = labelFilter.every(l => frontmatter.labels.includes(l));
        if (!hasAll) continue;
      }

      // Milestone filter
      if (milestoneFilter !== null) {
        if (milestoneFilter === 'none') {
          if (frontmatter.milestone !== null) continue;
        } else {
          if (frontmatter.milestone !== parseInt(milestoneFilter)) continue;
        }
      }

      // Assignee filter
      if (assigneeFilter !== null) {
        if (assigneeFilter === 'none') {
          if (frontmatter.assignees.length > 0) continue;
        } else {
          if (!frontmatter.assignees.includes(assigneeFilter)) continue;
        }
      }

      results.push({
        number: frontmatter.number,
        title: frontmatter.title,
        state: frontmatter.state,
        labels: frontmatter.labels,
        milestone: frontmatter.milestone,
        assignees: frontmatter.assignees,
        url: frontmatter.url,
      });
    } catch {
      // Skip unparseable files
    }
  }

  return results;
}

export const tools: ToolDef[] = [
  {
    name: 'issue_search',
    description: 'Search local .issues/ files by frontmatter fields (state, labels, milestone, assignee)',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the .issues/ directory'),
      state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by state'),
      labels: z.string().optional().describe('Comma-separated label names (AND logic)'),
      milestone: z.string().optional().describe('Milestone number or "none"'),
      assignee: z.string().optional().describe('Username or "none"'),
    }),
    handler: async (args, _ctx: GhContext) => {
      return searchIssues(args.path, {
        state: args.state,
        labels: args.labels,
        milestone: args.milestone,
        assignee: args.assignee,
      });
    },
  },
];
