# Repo Scaffold Design — claude-plugins-backalley

**Date:** 2026-03-28
**Status:** Approved

## Purpose

Set up `claude-plugins-backalley` as a private Claude Code plugin marketplace that can be git-cloned and installed by team members. Mirrors the structure of `claude-plugins-official` so plugins are immediately compatible with Claude Code's plugin system.

## Scope

Initial scaffold only — no plugins yet. Deliverables:

1. Repository structure (directories, gitignore, license)
2. Empty but valid `marketplace.json`
3. `CLAUDE.md` with plugin development conventions
4. `README.md` with installation and usage instructions

## Repository Structure

```
claude-plugins-backalley/
├── .claude-plugin/
│   └── marketplace.json       # Plugin registry (empty initially)
├── plugins/                   # All plugins live here
├── CLAUDE.md                  # Development conventions for Claude
├── README.md                  # Installation, usage, contributing
├── LICENSE                    # MIT
└── .gitignore                 # .claude/, *.DS_Store, node_modules, etc.
```

No `external_plugins/` directory — all plugins are first-party.

## Marketplace Architecture

The root `.claude-plugin/marketplace.json` is the **marketplace registry** — it tells Claude Code what plugins are available in this repo. Each individual plugin has its own `.claude-plugin/plugin.json` which holds **plugin-level metadata**. These serve different purposes:

- **Root `marketplace.json`** — discovery and installation (what's in this marketplace)
- **Per-plugin `plugin.json`** — plugin identity and metadata (what this plugin is)

### marketplace.json

Empty but schema-valid. The `$schema` URL is a convention from the official repo (not a fetchable endpoint):

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "plugins": []
}
```

When plugins are added, entries follow this format:

```json
{
  "name": "plugin-name",
  "description": "What the plugin does",
  "author": {
    "name": "Author Name"
  },
  "source": "./plugins/plugin-name",
  "category": "security"
}
```

Category is free-form text. Use what fits (e.g., `security`, `development`, `integration`).

### plugin.json (per-plugin)

Minimal required fields:

```json
{
  "name": "plugin-name",
  "description": "What the plugin does",
  "author": {
    "name": "Author Name"
  }
}
```

Optional fields: `version`, `homepage`, `repository`, `license`, `keywords`, `commands`, `agents`, `hooks`, `mcpServers`.

## CLAUDE.md Content

The CLAUDE.md serves as a machine-readable contributor guide. It covers:

### 1. Project Overview

This is a private Claude Code plugin marketplace. Plugins follow the same structure as `claude-plugins-official` (reference at `~/git/claude-plugins-official`).

### 2. Plugin Structure Convention

Every plugin must have:

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

### 3. Naming Conventions

- Plugin directories: `kebab-case`
- Skill directories: `kebab-case`
- Agent files: `kebab-case.md`
- All frontmatter `name` fields: `kebab-case`

### 4. Adding a New Plugin

Steps:
1. Create `plugins/<name>/` with `.claude-plugin/plugin.json`
2. Add components (skills, agents, hooks, MCP) as needed
3. Add entry to `.claude-plugin/marketplace.json`
4. Add README.md and LICENSE

### 5. Key Patterns

- Use `${CLAUDE_PLUGIN_ROOT}` for paths in hooks and MCP configs
- Skills use `skills/<name>/SKILL.md` (not the legacy `commands/` pattern)
- Hook scripts receive JSON on stdin, emit JSON on stdout
- MCP servers use `.mcp.json` at plugin root

### 6. Reference

- Official repo: `~/git/claude-plugins-official`
- Example plugin: `~/git/claude-plugins-official/plugins/example-plugin`
- Plugin dev guide: `~/git/claude-plugins-official/plugins/plugin-dev`

## README.md Content

Covers:
- What this repo is (private plugin marketplace)
- Installation: Users first add this repo as a marketplace source, then install plugins from it via Claude Code's `/plugin` interface. Exact commands depend on Claude Code's current plugin system — reference official docs at install time.
- Plugin listing (initially empty, will be updated as plugins are added)
- Link to CLAUDE.md for development conventions

## .gitignore

```
*.DS_Store
.claude/
node_modules/
.env
.env.*
```

## LICENSE

MIT license.

## Out of Scope

- Individual plugin implementations (CodeQL, Ghidra, LSPs)
- CI/CD pipelines
- Automated testing infrastructure

These will be designed separately when we build the first plugin.
