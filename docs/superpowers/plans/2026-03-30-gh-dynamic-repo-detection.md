# gh MCP Dynamic Repo Detection — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gh MCP plugin's broken startup repo detection with an on-demand `detect_repo` tool that accepts the user's project path.

**Architecture:** Add a shared state module (`state.ts`) for the cached default repo. Add a `detect_repo` tool (`tools/repo.ts`) that calls `detectRepo(cwd)` and caches the result. Modify `server.ts` to remove startup detection and special-case `detect_repo` in the dispatcher. Thread `cwd` through `exec()` → `execRaw()`.

**Tech Stack:** TypeScript, Bun, `@modelcontextprotocol/sdk`, Zod, `gh` CLI

**Spec:** `docs/superpowers/specs/2026-03-30-gh-mcp-dynamic-repo-detection.md`

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `plugins/gh/src/state.ts` | Shared default repo state (getter/setter) | Create |
| `plugins/gh/src/gh.ts` | GitHub CLI helpers | Modify: add `cwd` param to `exec()`, `execRaw()`, `detectRepo()`, update `resolveRepo()` error message |
| `plugins/gh/src/tools/repo.ts` | `detect_repo` tool definition | Create |
| `plugins/gh/src/server.ts` | MCP server entry point | Modify: remove startup detection, import state + repo tool, special-case dispatcher |

---

## Chunk 1: Core Changes

### Task 1: Create shared state module

**Files:**
- Create: `plugins/gh/src/state.ts`

- [ ] **Step 1: Create `state.ts`**

```typescript
import type { GhContext } from './gh.js';

let defaultRepo: GhContext | null = null;

export function getDefaultRepo(): GhContext | null {
  return defaultRepo;
}

export function setDefaultRepo(ctx: GhContext): void {
  defaultRepo = ctx;
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/gh/src/state.ts
git commit -m "feat(gh): add shared repo state module"
```

---

### Task 2: Thread `cwd` through `exec` / `execRaw` / `detectRepo` and update `resolveRepo` error

**Files:**
- Modify: `plugins/gh/src/gh.ts`

- [ ] **Step 1: Add `cwd` parameter to `execRaw()`**

In `plugins/gh/src/gh.ts`, change the `execRaw` function signature and pass `cwd` to `spawn`:

```typescript
async function execRaw(args: string[], stdin?: string, cwd?: string): Promise<string> {
  const proc = spawn(['gh', ...args], {
    stdin: stdin ? new Blob([stdin]) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    ...(cwd ? { cwd } : {}),
  });
  // ... rest unchanged
```

- [ ] **Step 2: Add `cwd` parameter to `exec()`**

```typescript
async function exec(args: string[], stdin?: string, cwd?: string): Promise<any> {
  const output = await execRaw(args, stdin, cwd);
  // ... rest unchanged
```

- [ ] **Step 3: Add `cwd` parameter to `detectRepo()`**

Update the `detectRepo` function signature and jsdoc, pass `cwd` through to `exec()`:

```typescript
/**
 * Detect current repo from gh CLI.
 * @param cwd — directory to detect repo from (must be inside a git repo with a GitHub remote)
 */
export async function detectRepo(cwd?: string): Promise<GhContext> {
  const result = await exec(['repo', 'view', '--json', 'owner,name'], undefined, cwd);
  const owner = result.owner?.login;
  if (!owner) throw new Error('Could not detect repo owner. Are you in a git repo with a GitHub remote?');
  return { owner, repo: result.name };
}
```

- [ ] **Step 4: Update `resolveRepo()` error message**

Change the error in `resolveRepo()` to guide the agent:

```typescript
export function resolveRepo(
  defaults: GhContext | null,
  opts?: GhOptions
): GhContext {
  const owner = opts?.owner ?? defaults?.owner;
  const repo = opts?.repo ?? defaults?.repo;
  if (!owner || !repo) {
    throw new Error(
      'No repository context set. Either pass owner/repo parameters, or call detect_repo with the project path first.'
    );
  }
  return { owner, repo };
}
```

- [ ] **Step 5: Verify the plugin still compiles**

Run: `cd plugins/gh && bun build src/server.ts --outdir /dev/null --no-bundle 2>&1 || echo "Type check with: bunx tsc --noEmit"`

Expected: No errors (or use `bunx tsc --noEmit` if available)

- [ ] **Step 6: Commit**

```bash
git add plugins/gh/src/gh.ts
git commit -m "feat(gh): thread cwd through exec/detectRepo, improve resolveRepo error"
```

---

### Task 3: Create `detect_repo` tool

**Files:**
- Create: `plugins/gh/src/tools/repo.ts`

- [ ] **Step 1: Create the tool file**

```typescript
import { z } from 'zod';
import { detectRepo } from '../gh.js';
import { setDefaultRepo } from '../state.js';
import type { ToolDef } from '../types.js';
import { existsSync } from 'node:fs';
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
      const ctx = await detectRepo(args.path);
      setDefaultRepo(ctx);
      return { ...ctx, cached: true };
    },
  },
];
```

Note: the handler ignores the `ctx` parameter — `detect_repo` is the tool that *establishes* context. The `server.ts` dispatcher will skip `resolveRepo()` for this tool (see Task 4).

- [ ] **Step 2: Verify it compiles**

Run: `cd plugins/gh && bunx tsc --noEmit 2>&1 || echo "Check for errors"`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add plugins/gh/src/tools/repo.ts
git commit -m "feat(gh): add detect_repo tool"
```

---

### Task 4: Update `server.ts` — remove startup detection, register tool, special-case dispatcher

**Files:**
- Modify: `plugins/gh/src/server.ts`

- [ ] **Step 1: Add imports for state and repo tool**

Add these imports at the top of `server.ts`:

```typescript
import { getDefaultRepo } from './state.js';
import { tools as repoTools } from './tools/repo.js';
```

- [ ] **Step 2: Register repo tools in `allTools`**

Add `...repoTools` to the `allTools` array:

```typescript
const allTools: ToolDef[] = [
  ...issueTools,
  ...labelTools,
  ...milestoneTools,
  ...projectTools,
  ...prTools,
  ...repoTools,
];
```

- [ ] **Step 3: Remove startup repo detection**

Remove the `defaultRepo` variable and the try/catch block that calls `detectRepo()`. Remove the `detectRepo` import from `./gh.js` (keep `checkGh`, `resolveRepo`, and the `GhContext` type). The startup section becomes:

```typescript
// --- Startup ---
await checkGh();
```

Update the import line:

```typescript
import { checkGh, resolveRepo } from './gh.js';
import type { GhContext } from './gh.js';
```

- [ ] **Step 4: Special-case `detect_repo` in the dispatcher**

In the `CallToolRequestSchema` handler, skip `resolveRepo()` for `detect_repo` since it doesn't need (or produce) a `GhContext` in the normal way:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = allTools.find(t => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
  }

  try {
    const args = tool.inputSchema.parse(req.params.arguments ?? {});

    // detect_repo establishes context — it doesn't need resolveRepo()
    if (tool.name === 'detect_repo') {
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
```

- [ ] **Step 5: Verify the plugin compiles**

Run: `cd plugins/gh && bunx tsc --noEmit 2>&1 || echo "Check for errors"`

- [ ] **Step 6: Commit**

```bash
git add plugins/gh/src/server.ts
git commit -m "feat(gh): remove startup detection, register detect_repo, use shared state"
```

---

### Task 5: Manual smoke test

- [ ] **Step 1: Start the MCP server and verify clean startup**

```bash
cd plugins/gh && echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}},"id":1}' | bun run src/server.ts 2>&1
```

Expected: Server starts without repo detection errors. stderr should NOT contain "detected repo" or "no git repo detected".

- [ ] **Step 2: Verify `detect_repo` appears in tool listing**

The `initialize` response should succeed. Send a `tools/list` request and verify `detect_repo` is in the list.

- [ ] **Step 3: Commit any fixes if needed**

---

## Final Checklist (from Acceptance Criteria)

- [ ] `detect_repo({ path: "/some/project" })` returns `{ owner, repo, cached: true }`
- [ ] After calling `detect_repo`, subsequent tool calls without explicit `owner`/`repo` use the cached default
- [ ] Calling a tool without `owner`/`repo` and without prior `detect_repo` returns a clear error message
- [ ] Explicit `owner`/`repo` on any tool call still overrides the cached default
- [ ] Startup no longer runs `detectRepo()` — server starts cleanly regardless of CWD
- [ ] `detect_repo` can be called multiple times to switch context
- [ ] `detect_repo` with a relative path returns a clear validation error
- [ ] `detect_repo` with a non-existent path returns a clear error
- [ ] `detect_repo` with a path that has no GitHub remote surfaces the `gh` error
