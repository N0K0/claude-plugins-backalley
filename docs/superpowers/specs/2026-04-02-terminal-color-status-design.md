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

**Known limitation:** `UserPromptSubmit` only fires on user prompt submission. If a `Stop` hook fires (setting the "ready" tint) but Claude continues processing (e.g., the stop is blocked), the terminal stays tinted until the next `UserPromptSubmit`. This is acceptable for v1 — the tint is subtle and the window is brief.

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

## hooks.json

```json
{
  "description": "Changes terminal background color to indicate input readiness",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/detect-osc.sh",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-processing.sh",
            "timeout": 2
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/set-ready.sh",
            "timeout": 2
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/cleanup.sh",
            "timeout": 2
          }
        ]
      }
    ]
  }
}
```

## Hook Event Mapping

| Hook Event | Script | Purpose | Output |
|---|---|---|---|
| `SessionStart` | `detect-osc.sh` | Detect OSC 11 support, save original background color | `{}` |
| `UserPromptSubmit` | `set-processing.sh` | Restore original background (processing started) | `{}` |
| `Stop` | `set-ready.sh` | Set tinted background (ready for input) | `{}` |
| `SessionEnd` | `cleanup.sh` | Restore original background, remove state file | `{}` |

All scripts emit `{}` on stdout (valid JSON, no side effects on the hook system).

## OSC Detection

1. Send `\e]11;?\a` to `/dev/tty` to query current background color
2. Read response with `read -t 2` from `/dev/tty`
3. Terminals respond in one of these formats:
   - `\e]11;rgb:RRRR/GGGG/BBBB\a` (BEL terminator)
   - `\e]11;rgb:RRRR/GGGG/BBBB\e\\` (ST terminator)
   - Some terminals use `rgba:` format
4. Parse with regex: extract everything between `11;` and the terminator (`\a` or `\e\\`)
5. Save the raw color string (e.g., `rgb:1a1a/1a1a/1a1a`) as-is for restoration
6. If `read` times out → mark `supported=false`

## Color Mechanics

- **Set color:** `printf '\e]11;#001a0a\a' > /dev/tty` (subtle dark green tint, hex format)
- **Restore color:** `printf '\e]11;%s\a' "$ORIGINAL_COLOR" > /dev/tty` (raw format from query)
- Both hex (`#RRGGBB`) and `rgb:RR/GG/BB` formats are valid OSC 11 payloads — we use hex for setting and replay the raw response for restoring
- v1 uses a hardcoded tint color (`#001a0a`). Optimized for dark terminal backgrounds.

## State Storage

State file at `${XDG_RUNTIME_DIR:-/tmp}/terminal-color-status-<session_id>`, created with `umask 077`:

```
supported=true
original_color=rgb:0000/0000/0000
```

Session ID extracted from hook input JSON. The `session_id` field is a simple alphanumeric string; extract with `grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"'` and strip quotes.

## Edge Cases

- **Ungraceful exit:** `SessionEnd` may not fire. Terminal stays tinted until user closes the tab or restarts. Documented as known limitation.
- **Multiple sessions:** Each session gets its own state file keyed by `session_id`. No interference between terminals.
- **SSH / tmux / screen:** OSC 11 passthrough varies. tmux requires `set -g allow-passthrough on`. Documented in README, not auto-detected.
- **Light terminal themes:** The hardcoded tint is designed for dark backgrounds. Light theme users would see an odd color. Noted in README as a v1 limitation.
- **Stop-then-continue:** If `Stop` fires but Claude continues, the terminal briefly shows the "ready" tint until the next `UserPromptSubmit`. Acceptable for v1.

## Dependencies

None. Pure bash, no external tools beyond standard coreutils.

## Terminal Compatibility

OSC 11 is supported by: Konsole, kitty, iTerm2, foot, Alacritty, WezTerm, most VTE-based terminals (GNOME Terminal, Tilix, etc.). Not supported by some minimal terminals (e.g., Linux virtual console).
