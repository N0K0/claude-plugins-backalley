import { z } from 'zod';
import { graphql } from '../gh.js';
import { type ToolDef } from '../types.js';

export const tools: ToolDef[] = [
  {
    name: 'project_list',
    description: 'List GitHub Projects V2 for a user or organization',
    inputSchema: z.object({
      owner: z.string().optional().describe('User or org login (defaults to current repo owner)'),
    }),
    handler: async (args, ctx) => {
      const login = args.owner ?? ctx.owner;
      const query = `
        query($login: String!, $first: Int!) {
          user(login: $login) {
            projectsV2(first: $first) {
              nodes { id number title shortDescription closed url }
            }
          }
        }
      `;
      try {
        const data = await graphql(query, { login, first: 20 });
        return data.user.projectsV2.nodes;
      } catch {
        // Might be an org, not a user
        const orgQuery = `
          query($login: String!, $first: Int!) {
            organization(login: $login) {
              projectsV2(first: $first) {
                nodes { id number title shortDescription closed url }
              }
            }
          }
        `;
        const data = await graphql(orgQuery, { login, first: 20 });
        return data.organization.projectsV2.nodes;
      }
    },
  },
  {
    name: 'project_items',
    description: 'List items in a GitHub Project V2',
    inputSchema: z.object({
      owner: z.string().optional().describe('Project owner (defaults to current repo owner)'),
      project_number: z.number().describe('Project number'),
      status: z.string().optional().describe('Filter by status field value'),
    }),
    handler: async (args, ctx) => {
      const login = args.owner ?? ctx.owner;
      const query = `
        query($login: String!, $number: Int!, $first: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              items(first: $first) {
                nodes {
                  id
                  fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { name }
                  }
                  content {
                    ... on Issue { number title state url }
                    ... on PullRequest { number title state url }
                  }
                }
              }
            }
          }
        }
      `;
      let items;
      try {
        const data = await graphql(query, { login, number: args.project_number, first: 100 });
        items = data.user.projectV2.items.nodes;
      } catch {
        const orgQuery = query.replace('user(login: $login)', 'organization(login: $login)');
        const data = await graphql(orgQuery, {
          login,
          number: args.project_number,
          first: 100,
        });
        items = data.organization.projectV2.items.nodes;
      }

      // Filter by status if requested
      if (args.status) {
        items = items.filter(
          (item: any) => item.fieldValueByName?.name?.toLowerCase() === args.status!.toLowerCase()
        );
      }

      return items;
    },
  },
  {
    name: 'project_move',
    description: 'Move a project item to a different status',
    inputSchema: z.object({
      owner: z.string().optional().describe('Project owner'),
      project_number: z.number().describe('Project number'),
      item_id: z.string().describe('Project item node ID (PVTI_...)'),
      status: z.string().describe('Target status value (e.g. "In Progress", "Done")'),
    }),
    handler: async (args, ctx) => {
      const login = args.owner ?? ctx.owner;

      // First, get the project ID and Status field ID + options
      const metaQuery = `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) {
              id
              field(name: "Status") {
                ... on ProjectV2SingleSelectField {
                  id
                  options { id name }
                }
              }
            }
          }
        }
      `;

      let project;
      try {
        const data = await graphql(metaQuery, { login, number: args.project_number });
        project = data.user.projectV2;
      } catch {
        const orgQuery = metaQuery.replace('user(login: $login)', 'organization(login: $login)');
        const data = await graphql(orgQuery, { login, number: args.project_number });
        project = data.organization.projectV2;
      }

      const statusField = project.field;
      const option = statusField.options.find(
        (o: any) => o.name.toLowerCase() === args.status.toLowerCase()
      );
      if (!option) {
        const available = statusField.options.map((o: any) => o.name).join(', ');
        throw new Error(`Status "${args.status}" not found. Available: ${available}`);
      }

      // Mutate
      const mutation = `
        mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }) {
            projectV2Item { id }
          }
        }
      `;

      return graphql(mutation, {
        projectId: project.id,
        itemId: args.item_id,
        fieldId: statusField.id,
        optionId: option.id,
      });
    },
  },
  {
    name: 'project_add',
    description: 'Add an issue or PR to a GitHub Project V2',
    inputSchema: z.object({
      owner: z.string().optional().describe('Project owner'),
      project_number: z.number().describe('Project number'),
      content_id: z.string().describe('Node ID of issue or PR (I_... or PR_...)'),
    }),
    handler: async (args, ctx) => {
      const login = args.owner ?? ctx.owner;

      // Get project node ID
      const metaQuery = `
        query($login: String!, $number: Int!) {
          user(login: $login) {
            projectV2(number: $number) { id }
          }
        }
      `;

      let projectId;
      try {
        const data = await graphql(metaQuery, { login, number: args.project_number });
        projectId = data.user.projectV2.id;
      } catch {
        const orgQuery = metaQuery.replace('user(login: $login)', 'organization(login: $login)');
        const data = await graphql(orgQuery, { login, number: args.project_number });
        projectId = data.organization.projectV2.id;
      }

      const mutation = `
        mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: {
            projectId: $projectId
            contentId: $contentId
          }) {
            item { id }
          }
        }
      `;

      return graphql(mutation, { projectId, contentId: args.content_id });
    },
  },
];
