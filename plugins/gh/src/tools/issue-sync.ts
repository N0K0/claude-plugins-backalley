import { z } from 'zod';
import { api, fetchAllComments } from '../gh.js';
import { repoParams, type ToolDef } from '../types.js';
import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { serializeIssue, parseIssueFile, issueFilePath, resolveIssuePaths, unifiedDiff } from './issue-files.js';

export const tools: ToolDef[] = [
  {
    name: 'issue_pull',
    description: 'Pull GitHub issues to local markdown files with YAML frontmatter and comments',
    inputSchema: z.object({
      ...repoParams,
      issue_number: z.number().optional().describe('Pull a single issue'),
      labels: z.string().optional().describe('Comma-separated label names'),
      state: z.enum(['open', 'closed', 'all']).optional().default('open').describe('Filter by state'),
      milestone: z.string().optional().describe('Milestone number, "*", or "none"'),
      assignee: z.string().optional().describe('Username or "none"'),
      path: z.string().describe('Absolute path to output directory'),
    }),
    handler: async (args, ctx) => {
      await mkdir(args.path, { recursive: true });

      let issues: any[];

      if (args.issue_number) {
        const issue = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${args.issue_number}`);
        issues = [issue];
      } else {
        issues = [];
        let page = 1;
        while (true) {
          const fields: Record<string, string> = {
            state: args.state ?? 'open',
            per_page: '100',
            page: String(page),
          };
          if (args.labels) fields.labels = args.labels;
          if (args.milestone) fields.milestone = args.milestone;
          if (args.assignee) fields.assignee = args.assignee;

          const batch = await api(`/repos/${ctx.owner}/${ctx.repo}/issues`, { fields });
          if (!Array.isArray(batch) || batch.length === 0) break;
          issues.push(...batch);
          if (batch.length < 100) break;
          page++;
        }
      }

      // Filter out pull requests
      issues = issues.filter((i: any) => !i.pull_request);

      const files = [];
      for (const issue of issues) {
        const comments = await fetchAllComments(ctx.owner, ctx.repo, issue.number);
        const filePath = issueFilePath(args.path, issue.number);
        const content = serializeIssue(issue, comments);
        await Bun.write(filePath, content);
        files.push({ path: filePath, number: issue.number, title: issue.title });
      }

      return { path: args.path, files };
    },
  },
  {
    name: 'issue_push',
    description: 'Push local markdown issue files back to GitHub, syncing metadata, body, and comments',
    inputSchema: z.object({
      ...repoParams,
      path: z.string().describe('Path to a markdown file or directory of issue files'),
    }),
    handler: async (args, ctx) => {
      const paths = await resolveIssuePaths(args.path);
      const results: any[] = [];
      const errors: any[] = [];

      for (const filePath of paths) {
        try {
          const content = await Bun.file(filePath).text();
          const { frontmatter, body, comments } = parseIssueFile(content);

          if (frontmatter.number === undefined) {
            // Create new issue
            const createBody: Record<string, unknown> = { title: frontmatter.title, body };
            if (frontmatter.labels?.length) createBody.labels = frontmatter.labels;
            if (frontmatter.milestone) createBody.milestone = frontmatter.milestone;
            if (frontmatter.assignees?.length) createBody.assignees = frontmatter.assignees;

            const created = await api(`/repos/${ctx.owner}/${ctx.repo}/issues`, {
              method: 'POST',
              body: createBody,
            });

            // Push any new comments on the new issue
            for (const c of comments) {
              if (!c.id) {
                await api(
                  `/repos/${ctx.owner}/${ctx.repo}/issues/${created.number}/comments`,
                  { method: 'POST', body: { body: c.body } },
                );
              }
            }

            // Reserialize with fresh data
            const allComments = await fetchAllComments(ctx.owner, ctx.repo, created.number);
            const serialized = serializeIssue(created, allComments);
            await Bun.write(filePath, serialized);

            // Rename file
            const newPath = join(dirname(filePath), `issue-${created.number}.md`);
            await rename(filePath, newPath);

            results.push({
              action: 'created',
              number: created.number,
              title: created.title,
              html_url: created.html_url,
              file: newPath.split('/').pop(),
            });
          } else {
            // Update existing issue metadata + body
            const patchBody: Record<string, unknown> = {
              title: frontmatter.title,
              state: frontmatter.state,
              labels: frontmatter.labels,
              milestone: frontmatter.milestone,
              assignees: frontmatter.assignees,
              body,
            };

            const result = await api(
              `/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`,
              { method: 'PATCH', body: patchBody },
            );

            // Sync comments
            const skipped: string[] = [];
            const remoteComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);
            const remoteById = new Map(remoteComments.map((c: any) => [c.id, c]));

            for (const local of comments) {
              if (!local.id) {
                // New comment — create
                await api(
                  `/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}/comments`,
                  { method: 'POST', body: { body: local.body } },
                );
              } else {
                // Existing comment — check if edited
                const remote = remoteById.get(local.id);
                if (remote && remote.body !== local.body) {
                  try {
                    await api(
                      `/repos/${ctx.owner}/${ctx.repo}/issues/comments/${local.id}`,
                      { method: 'PATCH', body: { body: local.body } },
                    );
                  } catch (err: any) {
                    skipped.push(`comment ${local.id} by @${local.author}: ${err.message}`);
                  }
                }
              }
            }

            // Re-fetch and rewrite file with fresh state
            const freshComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);
            await Bun.write(filePath, serializeIssue(result, freshComments));

            const pushResult: any = {
              action: 'updated',
              number: result.number,
              title: result.title,
              html_url: result.html_url,
            };
            if (skipped.length > 0) pushResult.skipped = skipped;
            results.push(pushResult);
          }
        } catch (err: any) {
          errors.push({
            file: filePath.split('/').pop(),
            error: err.message,
          });
        }
      }

      return errors.length > 0 ? { results, errors } : { results };
    },
  },
  {
    name: 'issue_diff',
    description: 'Compare local issue file(s) against current GitHub state, showing a unified diff of changes',
    inputSchema: z.object({
      ...repoParams,
      path: z.string().describe('Path to a markdown file or directory of issue files'),
    }),
    handler: async (args, ctx) => {
      const paths = await resolveIssuePaths(args.path);
      const diffs: any[] = [];
      const errors: any[] = [];

      for (const filePath of paths) {
        try {
          const content = await Bun.file(filePath).text();
          const { frontmatter, body, comments } = parseIssueFile(content);

          if (frontmatter.number === undefined) {
            errors.push({
              file: filePath.split('/').pop(),
              error: 'Skipped: new-issue file has no number (not yet pushed to GitHub)',
            });
            continue;
          }

          const remote = await api(`/repos/${ctx.owner}/${ctx.repo}/issues/${frontmatter.number}`);
          const remoteComments = await fetchAllComments(ctx.owner, ctx.repo, frontmatter.number);

          // Compare frontmatter fields
          const changes: string[] = [];
          const remoteLabels = (remote.labels ?? []).map((l: any) => l.name ?? l) as string[];
          const remoteMilestone = remote.milestone?.number ?? null;
          const remoteAssignees = (remote.assignees ?? []).map((a: any) => a.login ?? a) as string[];

          if (remote.title !== frontmatter.title) {
            changes.push(`title: "${remote.title}" → "${frontmatter.title}"`);
          }
          if (remote.state !== frontmatter.state) {
            changes.push(`state: ${remote.state} → ${frontmatter.state}`);
          }

          const addedLabels = frontmatter.labels.filter(l => !remoteLabels.includes(l));
          const removedLabels = remoteLabels.filter(l => !frontmatter.labels.includes(l));
          if (addedLabels.length || removedLabels.length) {
            const parts: string[] = [];
            if (addedLabels.length) parts.push(addedLabels.map(l => `+${l}`).join(' '));
            if (removedLabels.length) parts.push(removedLabels.map(l => `-${l}`).join(' '));
            changes.push(`labels: ${parts.join(' ')}`);
          }

          if (remoteMilestone !== frontmatter.milestone) {
            changes.push(`milestone: ${remoteMilestone} → ${frontmatter.milestone}`);
          }

          const addedAssignees = frontmatter.assignees.filter(a => !remoteAssignees.includes(a));
          const removedAssignees = remoteAssignees.filter(a => !frontmatter.assignees.includes(a));
          if (addedAssignees.length || removedAssignees.length) {
            const parts: string[] = [];
            if (addedAssignees.length) parts.push(addedAssignees.map(a => `+${a}`).join(' '));
            if (removedAssignees.length) parts.push(removedAssignees.map(a => `-${a}`).join(' '));
            changes.push(`assignees: ${parts.join(' ')}`);
          }

          // Body diff
          const remoteBody = remote.body ?? '';
          const bodyDiff = unifiedDiff(
            remoteBody, body,
            `a/issue-${frontmatter.number} (remote)`,
            `b/issue-${frontmatter.number} (local)`,
          );

          // Comment changes
          const commentChanges: any[] = [];
          const remoteById = new Map(remoteComments.map((c: any) => [c.id, c]));
          const localIds = new Set(comments.filter(c => c.id).map(c => c.id));

          // New local comments
          const newLocalComments = comments.filter(c => !c.id);
          if (newLocalComments.length > 0) {
            commentChanges.push({ type: 'new_local', count: newLocalComments.length });
          }

          // Edited comments
          for (const local of comments) {
            if (local.id) {
              const remote = remoteById.get(local.id);
              if (remote && remote.body !== local.body) {
                commentChanges.push({
                  type: 'edited',
                  id: local.id,
                  author: local.author,
                  diff: unifiedDiff(
                    remote.body, local.body,
                    `a/comment-${local.id} (remote)`,
                    `b/comment-${local.id} (local)`,
                  ),
                });
              }
            }
          }

          // New remote comments (not in local file)
          for (const rc of remoteComments) {
            if (!localIds.has(rc.id)) {
              commentChanges.push({
                type: 'new_remote',
                id: rc.id,
                author: rc.user?.login ?? 'unknown',
              });
            }
          }

          // Remote newer check
          const remoteNewer = frontmatter.pulled_at
            ? new Date(remote.updated_at) > new Date(frontmatter.pulled_at)
            : false;

          const hasChanges = changes.length > 0 || bodyDiff !== null || commentChanges.length > 0;
          const status = hasChanges ? 'modified' : 'up_to_date';

          diffs.push({
            number: frontmatter.number,
            title: frontmatter.title,
            status,
            changes,
            body_diff: bodyDiff,
            comment_changes: commentChanges.length > 0 ? commentChanges : undefined,
            remote_newer: remoteNewer,
          });
        } catch (err: any) {
          errors.push({
            file: filePath.split('/').pop(),
            error: err.message,
          });
        }
      }

      return errors.length > 0 ? { diffs, errors } : { diffs };
    },
  },
];
