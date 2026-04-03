# Terminal Color Status — Background OSC Loop Fix

**Date:** 2026-04-03
**Parent spec:** 2026-04-02-terminal-color-status-design.md

## Problem

The terminal-color-status plugin uses OSC 11 escape sequences to change the terminal background color between "ready" (green tint) and "processing" (original gray). The Stop hook (green) works reliably because Claude Code's TUI is idle. However, the UserPromptSubmit hook (gray reset) fails — the OSC 11 write to `/dev/tty` succeeds but has no visible effect because Claude Code's TUI rendering continuously overrides the terminal background.

### Root Cause

Claude Code uses Ink (React for terminals) which redraws the screen at ~270ms intervals during processing. Each redraw resets the terminal's visual state, overriding any OSC 11 background change made by a one-shot hook. The statusline command works because it fires on every render frame, repeatedly reapplying the color.

### Approaches Considered

1. **UserPromptSubmit hook (one-shot)** — OSC sent, TUI overrides it immediately. Failed.
2. **PreToolUse hook (one-shot)** — Same result.
3. **Delayed write (sleep 0.1 in background)** — Still overridden on next TUI render. Failed.
4. **Statusline integration** — Works, but requires modifying user's statusline script, not self-contained in plugin.
5. **Konsole D-Bus** — `setProfile` and `sendText` both blocked by Konsole's security settings.
6. **Background OSC loop** — Spawn a background process from the hook that continuously reapplies OSC 11 at ~200ms intervals, matching the TUI's render cadence. **Selected.**

## Design

### Architecture

```
SessionStart (detect-osc.sh)
  → Detect OSC 11 support, save original_color to state file

UserPromptSubmit (set-processing.sh)
  → Kill any existing loop (stale PID from previous cycle)
  → Spawn background loop: writes OSC 11 with original_color every 200ms
  → Save loop PID to state file
  → Exit immediately (emit JSON, close fds)

Stop (set-ready.sh)
  → Kill the background loop, confirm death
  → Write OSC 11 with READY_COLOR once (TUI is idle, single write works)
  → Clear loop PID from state file

SessionEnd (cleanup.sh)
  → Kill any running loop
  → Restore original color
  → Remove state file
```

### State File

Location: `${XDG_RUNTIME_DIR}/terminal-color-status-${SESSION_ID}`

```
supported=true
original_color=rgb:2323/2626/2727
loop_pid=
```

New field `loop_pid`: empty when no loop is running, PID of background loop process otherwise.

State file writes use atomic rename (`write to tmp, mv`) to prevent partial reads by concurrent hooks.

### Background Loop Process

```bash
start_loop() {
    local color="$1"
    local state_file="$2"
    ( trap 'exit 0' TERM
      while true; do
          printf '\e]11;%s\a' "$color" > /dev/tty 2>/dev/null || exit 1
          sleep 0.2
      done
    ) </dev/null >/dev/null 2>&1 &
    local pid=$!
    disown "$pid" 2>/dev/null
    # Update loop_pid in state file atomically
    update_loop_pid "$state_file" "$pid"
}
```

Key details:

- **fd detachment:** `</dev/null >/dev/null 2>&1` prevents the backgrounded process from holding the hook's stdout fd open. Without this, Claude Code's hook runner would wait for EOF and hit the timeout.
- **`disown`:** Prevents the shell from sending SIGHUP to the loop when the hook script exits.
- **`trap TERM`:** Ensures clean exit on SIGTERM from `kill_loop`.
- **`/dev/tty` failure exits:** If `/dev/tty` becomes unavailable (e.g., session ended), the loop exits immediately via `|| exit 1`.
- **No parent PID liveness check:** The hook's bash process exits immediately after spawning, so `$$`/`$PPID` would be stale. Instead, the loop runs until explicitly killed by `set-ready.sh`, `cleanup.sh`, or until `/dev/tty` fails. Orphan prevention relies on `/dev/tty` failure on session end and the `SessionEnd` hook.
- **200ms interval:** Matches observed TUI render cadence (~270ms). `sleep 0.2` requires GNU coreutils (standard on Linux).

### kill_loop Helper

```bash
kill_loop() {
    local state_file="$1"
    local pid
    pid=$(grep '^loop_pid=' "$state_file" 2>/dev/null | cut -d= -f2-)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null
        # Wait for death to prevent race with subsequent OSC write
        local i
        for i in 1 2 3 4 5; do
            kill -0 "$pid" 2>/dev/null || break
            sleep 0.05
        done
    fi
    update_loop_pid "$state_file" ""
}
```

- Reads PID from state file, checks if alive with `kill -0`
- Sends SIGTERM, then polls up to 250ms for the process to die
- Clears `loop_pid` from state file regardless
- **PID reuse risk:** Acknowledged but accepted for v1. The window between loop death and PID reuse is extremely small given the plugin's lifecycle. The loop's short lifetime (seconds to minutes) and the controlled kill path make accidental kills of unrelated processes unlikely.

### Safety Measures

- **Atomic state writes:** `write_state` writes to a temp file and `mv`s into place, preventing partial reads.
- **fd detachment:** Loop closes all inherited fds, preventing hook timeout.
- **Kill before spawn:** `set-processing.sh` kills any existing loop before starting a new one.
- **Kill-then-confirm before green:** `set-ready.sh` kills the loop and waits for death before writing the green color.
- **SessionEnd cleanup:** Kills any running loop and restores the original color.
- **`/dev/tty` self-exit:** Loop exits if `/dev/tty` writes fail (terminal gone).
- **Rapid prompt submissions:** Multiple fast `UserPromptSubmit` events each kill/respawn the loop. Brief flicker is expected and acceptable.

### hooks.json

Restores `UserPromptSubmit` (was removed during debugging, currently has `PreToolUse`):

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash .../detect-osc.sh", "timeout": 5 }] }],
    "UserPromptSubmit": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash .../set-processing.sh", "timeout": 2 }] }],
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash .../set-ready.sh", "timeout": 2 }] }],
    "SessionEnd": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "bash .../cleanup.sh", "timeout": 2 }] }]
  }
}
```

### Cleanup

Remove the OSC 11 block added to `~/.claude/statusline-command.sh` during debugging — the plugin handles everything now.

### Files Changed

- `hooks/hooks.json` — restore UserPromptSubmit hook (replace PreToolUse)
- `hooks/scripts/_common.sh` — add `kill_loop`, `start_loop`, `update_loop_pid` helpers; make `write_state` atomic; update `read_state` for `loop_pid`
- `hooks/scripts/set-processing.sh` — kill existing loop, spawn new one, exit fast
- `hooks/scripts/set-ready.sh` — kill loop (confirm death), write green
- `hooks/scripts/cleanup.sh` — kill loop, restore color, remove state
- `~/.claude/statusline-command.sh` — remove terminal-color-status block
