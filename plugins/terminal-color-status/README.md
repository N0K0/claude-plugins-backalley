# terminal-color-status

Changes your terminal background color to show what Claude Code is doing at a glance: subtle green when Claude is ready, yellow when waiting on you, default while processing. Currently Kitty-only, using its remote-control IPC for instant color changes that bypass TUI rendering.

## Install
```
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install terminal-color-status@claude-plugins-backalley
```

## Components

### Hooks

- **SessionStart** — `detect-kitty.sh` checks for Kitty support, captures the original background color, and clears any leftover tint from a crashed session.
- **UserPromptSubmit** — `set-processing.sh` restores the default background to signal "Claude is working".
- **Stop** — `set-ready.sh` paints a subtle green tint to signal "ready for your next prompt".
- **PermissionRequest:AskUserQuestion** — `set-elicitation.sh` paints a subtle yellow tint to signal "Claude needs your input".
- **PostToolUse:AskUserQuestion** — `set-processing.sh` restores the default background once you've answered.
- **Elicitation** — `set-elicitation.sh` paints yellow when an MCP elicitation request opens.
- **ElicitationResult** — `set-processing.sh` restores the default background after an elicitation completes.
- **SessionEnd** — `cleanup.sh` restores the original background and clears saved state.

The window is targeted via `KITTY_WINDOW_ID` so only the current Claude Code window is recolored. Tint colors live in `hooks/scripts/_common.sh` (`READY_COLOR`, `ELICIT_COLOR`, `DEFAULT_BG`).

## Requirements

- **Kitty terminal** with remote control enabled in `kitty.conf`:

  ```
  allow_remote_control socket-only
  listen_on unix:/tmp/kitty-{kitty_pid}
  ```

- The `kitty` command on `$PATH`
- A dark terminal theme (the tint colors are designed for dark backgrounds)

## License

[LICENSE](LICENSE)
