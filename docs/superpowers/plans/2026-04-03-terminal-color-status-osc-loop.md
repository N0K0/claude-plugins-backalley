# Terminal Color Status — Background OSC Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the terminal background color reset during processing by replacing the single-shot OSC 11 write with a background loop that continuously reapplies the color.

**Architecture:** The `UserPromptSubmit` hook spawns a detached background process that writes OSC 11 every 200ms, overriding the TUI's render resets. The `Stop` hook kills the loop and writes the green "ready" color once (TUI is idle). State is tracked in an existing per-session file in `$XDG_RUNTIME_DIR`.

**Tech Stack:** Bash, OSC 11 escape sequences, `/dev/tty`

**Spec:** `docs/superpowers/specs/2026-04-03-terminal-color-status-osc-loop-design.md`

---

## File Structure

All files are within `plugins/terminal-color-status/hooks/scripts/`. No new files created.

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `_common.sh` | Shared helpers: state I/O, loop lifecycle | Modify |
| `set-processing.sh` | UserPromptSubmit hook: kill old loop, spawn new one | Rewrite |
| `set-ready.sh` | Stop hook: kill loop, write green | Modify |
| `cleanup.sh` | SessionEnd hook: kill loop, restore color, remove state | Modify |
| `detect-osc.sh` | SessionStart hook: detect OSC support | No change |
| `../hooks.json` | Hook event wiring | Modify |
| `~/.claude/statusline-command.sh` | User's statusline script | Remove debug block |

---

## Chunk 1: Core Infrastructure

### Task 0: Restore UserPromptSubmit in hooks.json

**Files:**
- Modify: `plugins/terminal-color-status/hooks/hooks.json`

- [ ] **Step 1: Write the complete hooks.json with UserPromptSubmit**

The current file is missing the `UserPromptSubmit` entry (removed during debugging). Write the complete file:

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

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/hooks.json
git commit -m "fix(terminal-color-status): restore UserPromptSubmit hook in hooks.json"
```

---

### Task 1: Add loop lifecycle helpers to _common.sh

**Files:**
- Modify: `plugins/terminal-color-status/hooks/scripts/_common.sh`

- [ ] **Step 1: Make write_state atomic and add loop_pid field**

Replace the existing `write_state` function with an atomic version that also accepts a `loop_pid` parameter:

```bash
# Write state to state file atomically with restrictive permissions.
# Uses tmp+mv to prevent partial reads by concurrent hooks.
write_state() {
    local sup="$1"
    local color="$2"
    local pid="${3:-}"
    local tmp="${STATE_FILE}.tmp.$$"
    (umask 077; cat > "$tmp" <<STATEEOF
supported=${sup}
original_color=${color}
loop_pid=${pid}
STATEEOF
    )
    mv "$tmp" "${STATE_FILE}"
}
```

- [ ] **Step 2: Add update_loop_pid helper**

This does an atomic read-modify-write of just the `loop_pid` field, preserving `supported` and `original_color`:

```bash
# Update only the loop_pid field in the state file atomically.
update_loop_pid() {
    local state_file="$1"
    local new_pid="$2"
    local sup orig
    sup=$(grep '^supported=' "$state_file" 2>/dev/null | cut -d= -f2-)
    orig=$(grep '^original_color=' "$state_file" 2>/dev/null | cut -d= -f2-)
    local tmp="${state_file}.tmp.$$"
    (umask 077; cat > "$tmp" <<STATEEOF
supported=${sup}
original_color=${orig}
loop_pid=${new_pid}
STATEEOF
    )
    mv "$tmp" "$state_file"
}
```

- [ ] **Step 3: Add kill_loop helper**

```bash
# Kill the background OSC loop if running. Waits up to 250ms for death.
kill_loop() {
    local state_file="$1"
    local pid
    pid=$(grep '^loop_pid=' "$state_file" 2>/dev/null | cut -d= -f2-)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null
        local i
        for i in 1 2 3 4 5; do
            kill -0 "$pid" 2>/dev/null || break
            sleep 0.05
        done
    fi
    update_loop_pid "$state_file" ""
}
```

- [ ] **Step 4: Add start_loop helper**

```bash
# Spawn a detached background loop that writes OSC 11 every 200ms.
# The loop exits when /dev/tty fails or when killed by kill_loop.
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
    update_loop_pid "$state_file" "$pid"
}
```

- [ ] **Step 5: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/_common.sh
git commit -m "feat(terminal-color-status): add loop lifecycle helpers and atomic state writes"
```

---

## Chunk 2: Hook Scripts

### Task 2: Rewrite set-processing.sh

**Files:**
- Rewrite: `plugins/terminal-color-status/hooks/scripts/set-processing.sh`

- [ ] **Step 1: Rewrite set-processing.sh**

Replace the entire file:

```bash
#!/usr/bin/env bash
# UserPromptSubmit hook: spawn background OSC loop to restore original color.
# A single OSC 11 write gets overridden by Claude Code's TUI rendering.
# The loop reapplies every 200ms to match the TUI's ~270ms render cadence.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    kill_loop "$STATE_FILE"
    start_loop "$ORIGINAL_COLOR" "$STATE_FILE"
fi

emit_ok
```

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/set-processing.sh
git commit -m "feat(terminal-color-status): spawn background OSC loop on UserPromptSubmit"
```

---

### Task 3: Update set-ready.sh to kill loop before writing green

**Files:**
- Modify: `plugins/terminal-color-status/hooks/scripts/set-ready.sh`

- [ ] **Step 1: Add kill_loop call before the green write**

Replace the entire file:

```bash
#!/usr/bin/env bash
# Stop hook: kill background OSC loop, set terminal background to "ready" tint.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]]; then
    kill_loop "$STATE_FILE"
    printf '\e]11;%s\a' "$READY_COLOR" > /dev/tty 2>/dev/null
fi

emit_ok
```

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/set-ready.sh
git commit -m "fix(terminal-color-status): kill OSC loop before setting ready color"
```

---

### Task 4: Update cleanup.sh to kill loop

**Files:**
- Modify: `plugins/terminal-color-status/hooks/scripts/cleanup.sh`

- [ ] **Step 1: Add kill_loop call before restore**

Replace the entire file:

```bash
#!/usr/bin/env bash
# SessionEnd hook: kill OSC loop, restore original background color, remove state.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    kill_loop "$STATE_FILE"
    printf '\e]11;%s\a' "$ORIGINAL_COLOR" > /dev/tty 2>/dev/null
fi

# Clean up state file
rm -f "${STATE_FILE}"

emit_ok
```

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/cleanup.sh
git commit -m "fix(terminal-color-status): kill OSC loop on SessionEnd cleanup"
```

---

## Chunk 3: Cleanup and Test

### Task 5: Remove statusline workaround

**Files:**
- Modify: `~/.claude/statusline-command.sh` (lines 325-338)

- [ ] **Step 1: Remove the terminal-color-status OSC 11 block**

Remove the entire block from `# ---- Reset background to default during processing ----` through the closing `fi` (lines 325-338 approximately). The block starts with:
```
# ---- Reset background to default during processing ----
```
and ends with:
```
fi
```
just before `# ---- Terminal title ----`.

- [ ] **Step 2: No commit needed** — this is a user-local file, not in the repo.

---

### Task 6: Clear plugin cache and manual test

- [ ] **Step 1: Clear the stale plugin cache**

```bash
rm -rf ~/.claude/plugins/cache/backalley/terminal-color-status
```

- [ ] **Step 2: Reload plugins**

Run `/reload-plugins` in Claude Code.

- [ ] **Step 3: Manual test — verify green on Stop**

Send a message to Claude Code that triggers a tool call. When Claude finishes responding, the terminal background should turn green.

Expected: background turns green within 1 second of Claude stopping.

- [ ] **Step 4: Manual test — verify gray on next prompt**

Submit another message. The terminal background should reset to the original gray immediately.

Expected: background turns gray within ~200ms of submitting the prompt.

- [ ] **Step 5: Manual test — verify loop cleanup**

After the gray→green→gray cycle works, check that no orphan loop processes remain:

```bash
ps aux | grep 'sleep 0.2' | grep -v grep
```

Expected: one process during processing, zero after Stop fires.

- [ ] **Step 6: Commit all remaining unstaged changes**

```bash
git add -A plugins/terminal-color-status/
git commit -m "chore(terminal-color-status): clean up debug artifacts"
```
