# Terminal Color Status Plugin — Design Spec

**Issue:** #121
**Date:** 2026-04-02

## Overview

A hooks-based plugin that changes the terminal background color to provide a subtle visual cue when Claude Code is ready for new input vs. actively processing. Uses standard OSC 11 escape sequences for broad terminal compatibility.

## States

Two states:

| State | Background | When |
|---|---|---|
| Processing | Original (unchanged) | User submits prompt → Claude is working |
| Ready | Subtle green tint | Claude stops → waiting for input |

## Plugin Structure

```
plugins/terminal-color-status/
├── .claude-plugin/
│   └── plugin.json
├── hooks/
│   ├── hooks.json
│   └── scripts/
│       ├── detect-osc.sh
│       ├── set-ready.sh
│       ├── set-processing.sh
│       └── cleanup.sh
├── README.md
└── LICENSE
```

## Hook Event Mapping

| Hook Event | Script | Purpose |
|---|---|---|
| `SessionStart` | `detect-osc.sh` | Detect OSC 11 support, save original background color |
| `UserPromptSubmit` | `set-processing.sh` | Restore original background (processing started) |
| `Stop` | `set-ready.sh` | Set tinted background (ready for input) |
| `SessionEnd` | `cleanup.sh` | Restore original background, remove state file |

## OSC Detection

1. Send `\e]11;?\a` to `/dev/tty` to query current background color
2. Read response with `read -t 2` from `/dev/tty`
3. Terminal responds with `\e]11;rgb:RRRR/GGGG/BBBB\a` if supported
4. Parse and save original color; if timeout → mark `supported=false`

## Color Mechanics

- **Set color:** `printf '\e]11;#001a0a\a' > /dev/tty` (subtle dark green tint)
- **Restore color:** `printf '\e]11;%s\a' "$ORIGINAL_COLOR" > /dev/tty`
- v1 uses a hardcoded tint color (`#001a0a`). Optimized for dark terminal backgrounds.

## State Storage

State file at `/tmp/terminal-color-status-<session_id>`:

```
supported=true
original_color=rgb:0000/0000/0000
```

Session ID extracted from hook input JSON via `sed` (no `jq` dependency).

## Edge Cases

- **Ungraceful exit:** `SessionEnd` may not fire. Terminal stays tinted until user closes the tab or restarts. Documented as known limitation.
- **Multiple sessions:** Each session gets its own state file keyed by `session_id`. No interference between terminals.
- **SSH / tmux / screen:** OSC 11 passthrough varies. tmux requires `set -g allow-passthrough on`. Documented in README, not auto-detected.
- **Light terminal themes:** The hardcoded tint is designed for dark backgrounds. Light theme users would see an odd color. Noted in README as a v1 limitation.

## Dependencies

None. Pure bash, no external tools beyond standard coreutils.

## Terminal Compatibility

OSC 11 is supported by: Konsole, kitty, iTerm2, foot, Alacritty, WezTerm, most VTE-based terminals (GNOME Terminal, Tilix, etc.). Not supported by some minimal terminals (e.g., Linux virtual console).
