# markdown-format

A Claude Code plugin that automatically fixes common markdown formatting issues in `.md` files after every `Write` or `Edit` tool use.

## What It Does

After Claude writes or edits a `.md` file, this plugin runs a formatting pipeline over the file and rewrites it in-place if any issues are found. Claude Code is notified with a summary of what was fixed.

## Rules Applied

The following fixers run in order (enabled rules are uncommented in `hooks/scripts/fixers.py`):

- **Table alignment** — normalizes column widths in GFM tables
- **Trailing whitespace** — strips trailing spaces from every line
- **Code block spacing** — ensures blank lines around fenced code blocks
- **Heading spacing** — ensures blank lines above and below ATX headings
- **List markers** — normalizes unordered list markers to `-`

## Installation

Install via the marketplace or copy the plugin directory into your Claude Code plugins folder, then run `/reload-plugins`.

```
~/.claude/plugins/marketplaces/<marketplace>/plugins/markdown-format/
```

No additional dependencies are required — the hook script uses the Python standard library only.
