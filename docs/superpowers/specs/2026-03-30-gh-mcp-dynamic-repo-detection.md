# gh MCP Plugin — Dynamic Repo Detection

## Problem

The gh MCP server calls `detectRepo()` once at startup. Because the MCP server's working directory is the plugin install path (`~/.claude/plugins/marketplaces/.../plugins/gh/`), not the user's project, `gh repo view` either fails or detects the wrong repository. When the agent is working in a different project (e.g., `conga`), all GitHub API calls silently target the wrong repo.

## Solution

Replace startup detection with a `detect_repo` tool that the agent calls on demand with the actual project path. Use a hybrid strategy: try detection when asked, fall back to clear error messages that guide the agent to provide context.

## Design

### 1. Remove startup repo detection

`server.ts` currently calls `detectRepo()` at startup and caches the result in `defaultRepo`. Remove this call entirely — it runs in the wrong directory and produces incorrect results.

### 2. Add `detect_repo` tool

New tool in `src/tools/repo.ts`:

- **Input**: `path` (required string) — absolute path to a directory inside a git repo
- **Behavior**: Runs `gh repo view --json owner,name` with `cwd` set to the provided path
- **Output**: `{ owner, repo, cached: true }` on success
- **Side effect**: Caches the result as the session default repo
- **Idempotent**: Can be called multiple times to switch repo context

### 3. Modify `detectRepo()` to accept a `cwd` parameter

In `src/gh.ts`, change `detectRepo()` to accept an optional `cwd` string parameter. When provided, pass it to the `gh` subprocess as the working directory. This keeps the function reusable.

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
| `src/server.ts` | Remove startup `detectRepo()` call; import and register `detect_repo` tool |
| `src/gh.ts` | Add optional `cwd` parameter to `detectRepo()` and pass it through to `execRaw()` |
| `src/tools/repo.ts` | New file: `detect_repo` tool definition |
| `src/types.ts` | No changes |

## Acceptance Criteria

- [ ] `detect_repo({ path: "/some/project" })` returns `{ owner, repo, cached: true }`
- [ ] After calling `detect_repo`, subsequent tool calls without explicit `owner`/`repo` use the cached default
- [ ] Calling a tool without `owner`/`repo` and without prior `detect_repo` returns a clear error message
- [ ] Explicit `owner`/`repo` on any tool call still overrides the cached default
- [ ] Startup no longer runs `detectRepo()` — server starts cleanly regardless of CWD
- [ ] `detect_repo` can be called multiple times to switch context
