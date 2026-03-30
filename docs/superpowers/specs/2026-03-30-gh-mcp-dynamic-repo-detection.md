# gh MCP Plugin — Dynamic Repo Detection

## Problem

The gh MCP server calls `detectRepo()` once at startup. Because the MCP server's working directory is the plugin install path (`~/.claude/plugins/marketplaces/.../plugins/gh/`), not the user's project, `gh repo view` either fails or detects the wrong repository. When the agent is working in a different project (e.g., `conga`), all GitHub API calls silently target the wrong repo.

## Solution

Replace startup detection with a `detect_repo` tool that the agent calls on demand with the actual project path. Use a hybrid strategy: try detection when asked, fall back to clear error messages that guide the agent to provide context.

## Design

### 1. Remove startup repo detection

`server.ts` currently calls `detectRepo()` at startup and caches the result in `defaultRepo`. Remove this call entirely — it runs in the wrong directory and produces incorrect results.

### 2. Add shared repo state module

Create `src/state.ts` to hold the cached default repo. This avoids circular dependencies between `server.ts` and `repo.ts`:

```typescript
let defaultRepo: GhContext | null = null;
export function getDefaultRepo() { return defaultRepo; }
export function setDefaultRepo(ctx: GhContext) { defaultRepo = ctx; }
```

`server.ts` imports `getDefaultRepo()` for use in `resolveRepo()`. The `detect_repo` tool imports `setDefaultRepo()` to cache its result.

### 3. Add `detect_repo` tool

New tool in `src/tools/repo.ts`:

- **Input**: `path` (required string) — absolute path to a directory inside a git repo
- **Validation**: Rejects relative paths with a clear error
- **Behavior**: Runs `gh repo view --json owner,name` with `cwd` set to the provided path
- **Output**: `{ owner, repo, cached: true }` on success
- **Error cases**:
  - Path doesn't exist → `"Directory not found: <path>"`
  - Not a git repo / no GitHub remote → surfaces the `gh` error message
  - Relative path → `"Path must be absolute, got: <path>"`
- **Side effect**: Calls `setDefaultRepo()` to cache the result as the session default
- **Idempotent**: Can be called multiple times to switch repo context

The tool uses the standard `ToolDef` shape but is handled specially in `server.ts` — it does not go through `resolveRepo()` since it's the tool that *establishes* the repo context.

### 4. Modify `detectRepo()` and `exec()` to accept a `cwd` parameter

In `src/gh.ts`, add an optional `cwd` parameter to both `exec()` and `detectRepo()`. `detectRepo(cwd)` passes it to `exec()`, which passes it to `execRaw()` via `spawn`'s `cwd` option. This keeps the functions reusable.

### 4. Improve error when no repo context exists

In `resolveRepo()`, when no explicit `owner`/`repo` is provided and no default is cached, throw a descriptive error:

> `"No repository context set. Either pass owner/repo parameters, or call detect_repo with the project path first."`

### 5. Existing tool behavior unchanged

- All 21 existing tools keep their optional `owner`/`repo` parameters
- Explicit `owner`/`repo` on any tool call still takes priority over the cached default
- The `repoParams`, `api()`, `graphql()`, and `execRaw()` layers are untouched

## Files Changed

| File | Change |
|------|--------|
| `src/server.ts` | Remove startup `detectRepo()` call; use `getDefaultRepo()` from state; special-case `detect_repo` in dispatcher (skip `resolveRepo()`) |
| `src/state.ts` | New file: shared `defaultRepo` state with getter/setter |
| `src/gh.ts` | Add optional `cwd` parameter to `exec()` and `detectRepo()`, pass through to `execRaw()` via spawn |
| `src/tools/repo.ts` | New file: `detect_repo` tool definition using `setDefaultRepo()` |
| `src/types.ts` | No changes |

## Acceptance Criteria

- [ ] `detect_repo({ path: "/some/project" })` returns `{ owner, repo, cached: true }`
- [ ] After calling `detect_repo`, subsequent tool calls without explicit `owner`/`repo` use the cached default
- [ ] Calling a tool without `owner`/`repo` and without prior `detect_repo` returns a clear error message
- [ ] Explicit `owner`/`repo` on any tool call still overrides the cached default
- [ ] Startup no longer runs `detectRepo()` — server starts cleanly regardless of CWD
- [ ] `detect_repo` can be called multiple times to switch context
- [ ] `detect_repo` with a relative path returns a clear validation error
- [ ] `detect_repo` with a non-existent path returns a clear error
- [ ] `detect_repo` with a path that has no GitHub remote surfaces the `gh` error
