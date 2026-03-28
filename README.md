# claude-plugins-backalley

A private Claude Code plugin marketplace for security tooling and custom integrations. This repo hosts plugins that extend Claude Code with specialized capabilities — threat modeling, recon workflows, exploit scaffolding, and internal tooling not suitable for a public registry.

## Structure

```
.claude-plugin/      # Marketplace metadata (marketplace.json)
plugins/             # One subdirectory per plugin, each self-contained
scripts/             # Utility scripts (e.g., regenerating marketplace.json)
docs/                # Plugin specs, plans, and conventions
```

## Installation

Add this repo as a marketplace source in Claude Code, then install individual plugins through the `/plugin` interface.

Exact CLI syntax may change — refer to the [Claude Code plugin documentation](https://docs.anthropic.com/en/docs/claude-code) for current instructions on adding custom marketplace sources and installing plugins.

## Plugins

| Name | Description |
|------|-------------|
| _(none yet — table will be updated as plugins are added)_ | |

## Adding a Plugin

1. Create a new subdirectory under `plugins/` for your plugin.
2. Follow the conventions in `CLAUDE.md` for plugin structure, metadata, and skill definitions.
3. Regenerate `marketplace.json` (see below).

## Regenerating marketplace.json

After adding or updating a plugin, regenerate the marketplace index:

```bash
./scripts/generate-marketplace.sh
```

This updates `.claude-plugin/marketplace.json` with the latest plugin metadata.

## License

MIT — see [LICENSE](./LICENSE).
