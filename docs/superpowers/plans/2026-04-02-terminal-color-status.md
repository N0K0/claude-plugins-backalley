# Terminal Color Status Plugin — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hooks-based plugin that changes terminal background color via OSC 11 to indicate when Claude Code is ready for input.

**Architecture:** Four bash hook scripts wired to SessionStart, UserPromptSubmit, Stop, and SessionEnd events. A shared `_common.sh` provides session ID parsing and state file helpers. State persisted in `$XDG_RUNTIME_DIR` (or `/tmp`) per session.

**Tech Stack:** Bash, OSC 11 escape sequences, no external dependencies.

**Spec:** `docs/superpowers/specs/2026-04-02-terminal-color-status-design.md`

---

## Chunk 1: Plugin scaffold and shared utilities

### Task 0: Create plugin scaffold

**Files:**
- Create: `plugins/terminal-color-status/.claude-plugin/plugin.json`
- Create: `plugins/terminal-color-status/hooks/hooks.json`
- [ ] **Step 1: Create plugin.json**

```json
{
  "name": "terminal-color-status",
  "description": "Changes terminal background color to indicate when Claude Code is ready for input",
  "author": {
    "name": "nikolas"
  },
  "version": "0.1.0",
  "keywords": ["terminal", "hooks", "status", "color", "osc"]
}
```

Write to `plugins/terminal-color-status/.claude-plugin/plugin.json`.

- [ ] **Step 2: Create hooks.json**

Copy the exact hooks.json from the spec (`docs/superpowers/specs/2026-04-02-terminal-color-status-design.md`, lines 40-93). Write to `plugins/terminal-color-status/hooks/hooks.json`.

- [ ] **Step 3: Commit**

```bash
git add plugins/terminal-color-status/.claude-plugin/plugin.json \
       plugins/terminal-color-status/hooks/hooks.json
git commit -m "feat(terminal-color-status): add plugin scaffold with hooks.json"
```

---

### Task 1: Create shared utilities (_common.sh)

**Files:**
- Create: `plugins/terminal-color-status/hooks/scripts/_common.sh`

This file is sourced by all four hook scripts. It provides:
- `SESSION_ID`: parsed from stdin JSON
- `STATE_DIR`: `${XDG_RUNTIME_DIR:-/tmp}`
- `STATE_FILE`: `${STATE_DIR}/terminal-color-status-${SESSION_ID}`
- `parse_input()`: reads stdin, extracts session_id
- `read_state()`: sources the state file if it exists, sets `SUPPORTED` and `ORIGINAL_COLOR`
- `write_state()`: writes supported + original_color to state file

- [ ] **Step 1: Write _common.sh**

```bash
#!/usr/bin/env bash
# Shared utilities for terminal-color-status hook scripts.
# Sourced by each hook script — not executed directly.

set -euo pipefail

READY_COLOR="#001a0a"
STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}"

# Parse session_id from hook input JSON on stdin.
# Sets SESSION_ID and STATE_FILE globals.
parse_input() {
    local input
    input=$(cat)
    SESSION_ID=$(printf '%s' "$input" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*:.*"\([^"]*\)"/\1/')
    if [[ -z "${SESSION_ID:-}" ]]; then
        echo '{}' 
        exit 0
    fi
    STATE_FILE="${STATE_DIR}/terminal-color-status-${SESSION_ID}"
}

# Read state file into SUPPORTED and ORIGINAL_COLOR globals.
# Returns 1 if state file doesn't exist.
read_state() {
    if [[ ! -f "${STATE_FILE}" ]]; then
        return 1
    fi
    # shellcheck source=/dev/null
    source "${STATE_FILE}"
    SUPPORTED="${supported:-false}"
    ORIGINAL_COLOR="${original_color:-}"
}

# Write state to state file with restrictive permissions.
write_state() {
    local sup="$1"
    local color="$2"
    (umask 077; cat > "${STATE_FILE}" <<STATEEOF
supported=${sup}
original_color=${color}
STATEEOF
    )
}

# Emit empty JSON to stdout (required hook output).
emit_ok() {
    echo '{}'
}
```

Write to `plugins/terminal-color-status/hooks/scripts/_common.sh`.

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/_common.sh
git commit -m "feat(terminal-color-status): add shared utilities for state and JSON parsing"
```

---

## Chunk 2: Hook scripts

### Task 2: Create detect-osc.sh (SessionStart)

**Files:**
- Create: `plugins/terminal-color-status/hooks/scripts/detect-osc.sh`

- [ ] **Step 1: Write detect-osc.sh**

```bash
#!/usr/bin/env bash
# SessionStart hook: detect OSC 11 support and save original background color.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

# Query terminal for current background color via OSC 11.
# Sends: ESC ] 11 ; ? BEL
# Expects: ESC ] 11 ; rgb:RRRR/GGGG/BBBB BEL (or ST terminator)
detect_osc_support() {
    local response=""

    # Send query to terminal
    printf '\e]11;?\a' > /dev/tty

    # Read response with 2-second timeout.
    # Terminal response contains escape sequences, so use -r and -d to read until
    # BEL (\a, 0x07) or backslash (ST terminator ends with \).
    # We read raw bytes with a timeout.
    if IFS= read -r -s -t 2 -d $'\a' response < /dev/tty 2>/dev/null; then
        : # Got BEL-terminated response
    elif IFS= read -r -s -t 2 -d '\\' response < /dev/tty 2>/dev/null; then
        : # Got ST-terminated response
    else
        # No response — terminal doesn't support OSC 11
        write_state "false" ""
        emit_ok
        return
    fi

    # Extract color value: everything after "11;" in the response.
    # Response looks like: ESC]11;rgb:RRRR/GGGG/BBBB
    local color
    color=$(printf '%s' "$response" | sed 's/.*11;//' | tr -d '[:cntrl:]')

    if [[ -n "$color" ]]; then
        write_state "true" "$color"
    else
        write_state "false" ""
    fi
    emit_ok
}

detect_osc_support
```

Write to `plugins/terminal-color-status/hooks/scripts/detect-osc.sh`.
Make executable: `chmod +x plugins/terminal-color-status/hooks/scripts/detect-osc.sh`.

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/detect-osc.sh
git commit -m "feat(terminal-color-status): add OSC 11 detection hook (SessionStart)"
```

---

### Task 3: Create set-ready.sh (Stop)

**Files:**
- Create: `plugins/terminal-color-status/hooks/scripts/set-ready.sh`

- [ ] **Step 1: Write set-ready.sh**

```bash
#!/usr/bin/env bash
# Stop hook: set terminal background to "ready" tint color.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]]; then
    printf '\e]11;%s\a' "$READY_COLOR" > /dev/tty
fi

emit_ok
```

Write to `plugins/terminal-color-status/hooks/scripts/set-ready.sh`.
Make executable: `chmod +x plugins/terminal-color-status/hooks/scripts/set-ready.sh`.

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/set-ready.sh
git commit -m "feat(terminal-color-status): add ready-tint hook (Stop)"
```

---

### Task 4: Create set-processing.sh (UserPromptSubmit)

**Files:**
- Create: `plugins/terminal-color-status/hooks/scripts/set-processing.sh`

- [ ] **Step 1: Write set-processing.sh**

```bash
#!/usr/bin/env bash
# UserPromptSubmit hook: restore original background color (processing started).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    printf '\e]11;%s\a' "$ORIGINAL_COLOR" > /dev/tty
fi

emit_ok
```

Write to `plugins/terminal-color-status/hooks/scripts/set-processing.sh`.
Make executable: `chmod +x plugins/terminal-color-status/hooks/scripts/set-processing.sh`.

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/set-processing.sh
git commit -m "feat(terminal-color-status): add processing-restore hook (UserPromptSubmit)"
```

---

### Task 5: Create cleanup.sh (SessionEnd)

**Files:**
- Create: `plugins/terminal-color-status/hooks/scripts/cleanup.sh`

- [ ] **Step 1: Write cleanup.sh**

```bash
#!/usr/bin/env bash
# SessionEnd hook: restore original background color and remove state file.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_common.sh
source "${SCRIPT_DIR}/_common.sh"

parse_input

if read_state && [[ "$SUPPORTED" == "true" ]] && [[ -n "$ORIGINAL_COLOR" ]]; then
    printf '\e]11;%s\a' "$ORIGINAL_COLOR" > /dev/tty
fi

# Clean up state file
rm -f "${STATE_FILE}"

emit_ok
```

Write to `plugins/terminal-color-status/hooks/scripts/cleanup.sh`.
Make executable: `chmod +x plugins/terminal-color-status/hooks/scripts/cleanup.sh`.

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/hooks/scripts/cleanup.sh
git commit -m "feat(terminal-color-status): add cleanup hook (SessionEnd)"
```

---

## Chunk 3: Documentation and finalization

### Task 6: Create README.md

**Files:**
- Create: `plugins/terminal-color-status/README.md`

- [ ] **Step 1: Write README.md**

```markdown
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
```

Write to `plugins/terminal-color-status/README.md`.

- [ ] **Step 2: Commit**

```bash
git add plugins/terminal-color-status/README.md
git commit -m "docs(terminal-color-status): add README"
```

---

### Task 7: Update marketplace.json and final verification

**Files:**
- Modify: `marketplace.json` (via `./scripts/generate-marketplace.sh`)

- [ ] **Step 1: Run marketplace generator**

```bash
./scripts/generate-marketplace.sh
```

- [ ] **Step 2: Verify plugin structure**

```bash
ls -la plugins/terminal-color-status/.claude-plugin/plugin.json
ls -la plugins/terminal-color-status/hooks/hooks.json
ls -la plugins/terminal-color-status/hooks/scripts/*.sh
ls -la plugins/terminal-color-status/README.md
```

Expected: all 7 files present, scripts are executable.

- [ ] **Step 3: Verify hooks.json is valid JSON**

```bash
python3 -c "import json; json.load(open('plugins/terminal-color-status/hooks/hooks.json'))"
```

Expected: no output (valid JSON).

- [ ] **Step 4: Commit marketplace update**

```bash
git add marketplace.json
git commit -m "chore: regenerate marketplace.json with terminal-color-status"
```

- [ ] **Step 5: Manual test**

Install the plugin locally and start a new Claude Code session. Verify:
1. Session starts without errors
2. After Claude finishes responding, terminal background shifts subtly
3. After submitting a new prompt, background returns to normal
4. After exiting Claude Code, background is restored
