# terminal-color-status

A Claude Code plugin that changes your terminal background color to indicate when Claude is ready for new input.

## How it works

When Claude finishes processing and is waiting for your input, the terminal background shifts to a subtle green tint. When you submit a new prompt, it returns to your normal background color.

This gives you a peripheral visual cue — useful when you're multitasking across multiple terminals.

## States

| State | Background |
|---|---|
| Processing | Your normal terminal background |
| Ready for input | Subtle dark green tint |

## Terminal compatibility

Uses standard OSC 11 escape sequences. Supported by:

- Konsole
- kitty
- iTerm2
- foot
- Alacritty
- WezTerm
- Most VTE-based terminals (GNOME Terminal, Tilix, etc.)

The plugin auto-detects support at session start. If your terminal doesn't support OSC 11, the plugin silently does nothing.

## Known limitations

- **Dark themes only (v1):** The tint color (`#001a0a`) is designed for dark backgrounds. Light theme users may see an unexpected color.
- **tmux / screen:** OSC 11 passthrough may not work by default. In tmux, enable it with: `set -g allow-passthrough on`
- **Ungraceful exit:** If Claude Code crashes, the terminal may stay tinted until you close the tab.
