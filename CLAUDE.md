# CLAUDE.md — Plugin Development Guide

## Project Overview

This is a private Claude Code plugin marketplace (`claude-plugins-backalley`). Plugins follow the same structure as the official plugin registry at `~/git/claude-plugins-official`. When in doubt, consult that repo for canonical examples.

## Plugin Structure Convention

Every plugin lives under `plugins/<plugin-name>/` and must follow this layout:

```
plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json            # Required: name, description, author
├── skills/                    # Optional: skills/<name>/SKILL.md
├── agents/                    # Optional: agents/<name>.md
├── hooks/                     # Optional: hooks/hooks.json + scripts
├── .mcp.json                  # Optional: MCP server config
├── README.md                  # Required: documentation
└── LICENSE                    # Required
```

Minimum viable plugin: `.claude-plugin/plugin.json`, `README.md`, `LICENSE`.

## Naming Conventions

- Plugin directories: `kebab-case`
- Skill directories: `kebab-case`
- Agent files: `kebab-case.md`
- All frontmatter `name` fields: `kebab-case`

## Adding a New Plugin

1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`
2. Add components (skills, agents, hooks, MCP) as needed
3. Run `./scripts/generate-marketplace.sh` to update `marketplace.json`
4. Optionally set `category` in `marketplace.json` for the new entry
5. Add `README.md` and `LICENSE`

## Key Patterns

- Use `${CLAUDE_PLUGIN_ROOT}` for paths in hooks and MCP configs — do not hardcode absolute paths
- Skills use `skills/<name>/SKILL.md` — do not use the legacy `commands/` pattern
- Hook scripts receive JSON on stdin and must emit JSON on stdout
- MCP servers are configured via `.mcp.json` at the plugin root

## MCP Server Gotchas

**Working directory is NOT the user's project.** When Claude Code launches an MCP server, `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin's install path (e.g., `~/.claude/plugins/marketplaces/.../plugins/<name>/`), not the user's current working directory. This means:

- `gh repo view`, `git` commands, and anything that depends on being inside a git repo will fail
- File-relative paths resolve to the plugin install dir, not the user's project
- Any startup logic that assumes a project context must handle the case where there is none

**Design MCP servers to start gracefully without project context.** Auto-detection (like repo detection) should be best-effort — catch failures and fall back to requiring explicit parameters from the user. Never let a missing project context crash the server on startup.

## Marketplace Configuration

For development, the marketplace is configured as a local path symlink rather than a remote git repo. This allows changes to be picked up immediately without pulling.

The symlink lives at: `~/.claude/plugins/marketplaces/N0K0-claude-plugins-backalley` → `/home/nikolas/git/claude-plugins-backalley`

After making changes, run `/reload-plugins` to pick them up.

## Development Workflow

- Use git worktrees and feature branches for all feature work — never commit directly to main
- Specs go in GitHub Issues (label: `spec`)
- Implementation plans can temporarily live in the repo (`docs/superpowers/plans/`)
- When a plan is fully implemented, create a pull request
- PRs are reviewed by both Claude Code review skills and the user before merging

## Reference

- Official repo: `~/git/claude-plugins-official`
- Example plugin: `~/git/claude-plugins-official/plugins/example-plugin`
- Plugin dev guide: `~/git/claude-plugins-official/plugins/plugin-dev`
