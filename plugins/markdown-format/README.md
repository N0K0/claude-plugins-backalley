# markdown-format

Auto-fix common markdown formatting issues in `.md` files. After Claude writes or edits any markdown file, the plugin runs a small Python fixer pipeline and rewrites the file in place.

## Install
```
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install markdown-format@claude-plugins-backalley
```

## Components

### Hooks

- **PostToolUse:Write / Edit** — `track-markdown.py` records the touched `.md` path to a per-session tracking file in `$TMPDIR`. The file itself is not modified yet.
- **Stop** — `format-markdown.py` runs at end of turn, reads the tracked paths, runs the fixer pipeline on each, and rewrites any file that changed. Claude is told what was fixed and the tracking file is cleared.

Deferring the rewrite to end of turn means Claude sees the content it just wrote for the rest of the turn, instead of observing its own edits being reshuffled underneath it.

The fixers (in `hooks/scripts/fixers.py`) currently handle: GFM table alignment, trailing whitespace, blank lines around fenced code blocks, blank lines around ATX headings, and unordered list marker normalization to `-`.

## Requirements

- `python3` available on `PATH` (standard library only — no extra packages)

## License

[LICENSE](LICENSE)
