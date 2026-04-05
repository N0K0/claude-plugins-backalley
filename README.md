# claude-plugins-backalley

A private Claude Code plugin marketplace. Plugins here extend Claude Code with custom workflows, integrations, and tooling.

**Warning:** This is a vibecoded mess built for my own use. Expect rough edges. Sharing in case it's useful to others.

## Plugins

| Name                                                    | Description                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [gh](plugins/gh/)                                       | MCP server for GitHub CLI — issue pull/push/diff with comment sync and local search                                                               |
| [markdown-format](plugins/markdown-format/)             | Auto-fix common markdown formatting issues in .md files                                                                                           |
| [process](plugins/process/)                             | GitHub Issues-driven dev workflow inspired by [superpowers](https://github.com/obra/superpowers), built on Claude native features + GitHub Issues |
| [terminal-color-status](plugins/terminal-color-status/) | Changes terminal background color to show Claude's state — currently Kitty-only, OSC support planned                                              |

## Installation

Add this marketplace and install plugins:

```bash
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install <plugin-name>@N0K0/claude-plugins-backalley
```

See each plugin's README for usage details. For more on Claude Code plugins, see the [official documentation](https://docs.anthropic.com/en/docs/claude-code).

## License

MIT — see [LICENSE](./LICENSE).
