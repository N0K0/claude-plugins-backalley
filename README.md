# claude-plugins-backalley

A private Claude Code plugin marketplace. Plugins here extend Claude Code with custom workflows, integrations, and tooling.

## Plugins

| Name                                                    | Description                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [gh](plugins/gh/)                                       | MCP server for GitHub CLI — issue pull/push/diff with comment sync and local search                                         |
| [markdown-format](plugins/markdown-format/)             | Auto-fix common markdown formatting issues in .md files                                                                     |
| [process](plugins/process/)                             | GitHub Issues-driven development workflow — brainstorm, plan, execute, review, with TDD, debugging, and verification skills |
| [terminal-color-status](plugins/terminal-color-status/) | Changes terminal background color to indicate when Claude Code is ready for input                                           |

## Installation

Add this marketplace and install plugins:

```bash
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install <plugin-name>@N0K0/claude-plugins-backalley
```

See each plugin's README for usage details. For more on Claude Code plugins, see the [official documentation](https://docs.anthropic.com/en/docs/claude-code).

## License

MIT — see [LICENSE](./LICENSE).
