# terminal-color-status

A Claude Code plugin that changes your terminal background color to show what Claude is doing at a glance.

## How it works

The plugin uses Kitty's remote control IPC (Unix socket) to change the background color of the current terminal window. This bypasses Claude Code's TUI rendering, so color changes are instant and reliable.

## States

| State       | Color              | When                                             |
| ----------- | ------------------ | ------------------------------------------------ |
| Processing  | Default background | You submitted a prompt, Claude is working        |
| Ready       | Subtle green tint  | Claude finished, waiting for your next prompt    |
| Needs input | Subtle yellow tint | Claude asked a question, waiting for your answer |

The color changes are subtle enough to work as a peripheral cue — you'll notice the shift without it being distracting.

## Requirements

- **Kitty terminal** with remote control enabled in `kitty.conf`:

  ```
  allow_remote_control socket-only
  listen_on unix:/tmp/kitty-{kitty_pid}
  ```

- The `kitty` command must be in your `$PATH`.

## Configuration

Colors are defined in `hooks/scripts/_common.sh`:

```bash
READY_COLOR="#001a0a"    # green tint — Claude is done
ELICIT_COLOR="#1a1a00"   # yellow tint — Claude needs input
DEFAULT_BG="#232627"     # fallback if detection fails
```

The plugin auto-detects your actual background color at session start via `kitty @ get-colors`, so `DEFAULT_BG` is only used as a fallback.

## Hook events

| Event                               | Action                                               |
| ----------------------------------- | ---------------------------------------------------- |
| `SessionStart`                      | Detect Kitty support, save original background color |
| `UserPromptSubmit`                  | Restore original background (processing)             |
| `Stop`                              | Set green tint (ready)                               |
| `PermissionRequest:AskUserQuestion` | Set yellow tint (needs input)                        |
| `PostToolUse:AskUserQuestion`       | Restore original background (answered)               |
| `Elicitation`                       | Set yellow tint (needs input)                        |
| `ElicitationResult`                 | Restore original background (answered)               |
| `SessionEnd`                        | Restore original background, clean up state          |

## How it targets only the current window

Each Kitty window gets a `KITTY_WINDOW_ID` environment variable. The plugin uses `kitty @ set-colors --match id:$KITTY_WINDOW_ID` to change only the window running the current Claude Code session. Other terminal windows are unaffected.

## Known limitations

- **Kitty only** — uses Kitty's remote control IPC. Other terminals are not supported.
- **Dark themes only** — the tint colors are designed for dark backgrounds.
- **Ungraceful exit** — if Claude Code crashes, the background may stay tinted. Run `kitty @ set-colors --reset` to fix, or start a new session (the `SessionStart` hook detects and corrects leftover tints).
