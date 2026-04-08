# markdown-format

Auto-fix common markdown formatting issues in `.md` files. After Claude writes or edits any markdown file, the plugin runs a small Python fixer pipeline and rewrites the file in place.

## Install
```
/plugin marketplace add N0K0/claude-plugins-backalley
/plugin install markdown-format@claude-plugins-backalley
```

## Components

### Hooks

- **PostToolUse:Write** — runs `format-markdown.py` on the written file. If any fixers change content, the file is rewritten and Claude is told what was fixed.
- **PostToolUse:Edit** — same as above, triggered after `Edit` tool calls. Ensures every edit produces clean markdown without extra prompting.

The fixers (in `hooks/scripts/fixers.py`) currently handle: GFM table alignment, trailing whitespace, blank lines around fenced code blocks, blank lines around ATX headings, and unordered list marker normalization to `-`.

## Requirements

- `python3` available on `PATH` (standard library only — no extra packages)

## License

[LICENSE](LICENSE)
