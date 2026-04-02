# Markdown Format Hook Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers-extended-cc:subagent-driven-development (if subagents available) or superpowers-extended-cc:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PostToolUse hook plugin that auto-fixes common markdown formatting issues (tables, whitespace, headings, list markers) when Claude writes/edits `.md` files.

**Architecture:** Single Python script triggered by PostToolUse hooks on Write and Edit tools. The script reads the file from disk, runs a pipeline of standalone fixer functions (skipping fenced code blocks), writes back if changed, and returns a systemMessage listing what was fixed.

**Tech Stack:** Python 3 (stdlib only — no external dependencies)

**Spec:** `docs/superpowers/specs/2026-04-02-markdown-format-hook-design.md`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `plugins/markdown-format/.claude-plugin/plugin.json` | Plugin metadata |
| `plugins/markdown-format/hooks/hooks.json` | Hook configuration (PostToolUse matchers for Write, Edit) |
| `plugins/markdown-format/hooks/scripts/format-markdown.py` | Main hook script — stdin parsing, fixer pipeline, stdout output |
| `plugins/markdown-format/hooks/scripts/fixers.py` | All fixer functions + code block region detection |
| `plugins/markdown-format/hooks/scripts/test_fixers.py` | Unit tests for every fixer function |
| `plugins/markdown-format/README.md` | Documentation |
| `plugins/markdown-format/LICENSE` | MIT license |

**Why split `fixers.py` from `format-markdown.py`?** The fixers are pure `str -> str` functions that are easy to unit test in isolation. The main script handles stdin/stdout/file I/O — a thin orchestration layer. This separation keeps both files focused and testable.

---

## Chunk 1: Plugin Scaffold + Script Skeleton

### Task 0: Create plugin scaffold

**Files:**
- Create: `plugins/markdown-format/.claude-plugin/plugin.json`
- Create: `plugins/markdown-format/hooks/hooks.json`
- Create: `plugins/markdown-format/README.md`
- Create: `plugins/markdown-format/LICENSE`

- [ ] **Step 1: Create plugin.json**

```json
{
  "name": "markdown-format",
  "description": "Auto-fix common markdown formatting issues in .md files",
  "author": {
    "name": "nikolas"
  },
  "version": "0.1.0",
  "keywords": ["markdown", "formatting", "hooks"]
}
```

- [ ] **Step 2: Create hooks.json**

```json
{
  "description": "Auto-fix common markdown formatting issues in .md files",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/format-markdown.py",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/format-markdown.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Create README.md**

Brief README covering: what the plugin does, which rules it applies, how to install.

- [ ] **Step 4: Create LICENSE**

MIT license, author nikolas, year 2026.

- [ ] **Step 5: Commit**

```bash
git add plugins/markdown-format/
git commit -m "feat(markdown-format): add plugin scaffold with hooks config"
```

---

### Task 1: Create script skeleton with stdin parsing

**Files:**
- Create: `plugins/markdown-format/hooks/scripts/format-markdown.py`
- Create: `plugins/markdown-format/hooks/scripts/fixers.py`

- [ ] **Step 1: Write format-markdown.py skeleton**

```python
#!/usr/bin/env python3
"""PostToolUse hook: auto-fix markdown formatting in .md files."""

import json
import os
import sys

from fixers import run_pipeline


def main():
    try:
        input_data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        print(json.dumps({}))
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if not file_path.endswith(".md"):
        print(json.dumps({}))
        sys.exit(0)

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            original = f.read()
    except (OSError, IOError):
        print(json.dumps({}))
        sys.exit(0)

    result, fixes = run_pipeline(original)

    if not fixes:
        print(json.dumps({}))
        sys.exit(0)

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(result)

    filename = os.path.basename(file_path)
    fix_list = ", ".join(fixes)
    message = f"Markdown formatting: fixed {fix_list} in {filename}"
    print(json.dumps({"systemMessage": message}))
    sys.exit(0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write fixers.py stub**

```python
#!/usr/bin/env python3
"""Markdown formatting fixers. Each fixer is str -> str."""


def run_pipeline(content: str) -> tuple[str, list[str]]:
    """Run all fixers in order. Returns (fixed_content, list_of_fix_names)."""
    fixes = []
    for name, fixer in FIXERS:
        new_content = fixer(content)
        if new_content != content:
            fixes.append(name)
            content = new_content
    return content, fixes


FIXERS: list[tuple[str, callable]] = [
    # ("table alignment", fix_tables),
    # ("trailing whitespace", fix_trailing_whitespace),
    # ("code block spacing", fix_code_block_spacing),
    # ("heading spacing", fix_heading_spacing),
    # ("list markers", fix_list_markers),
]
```

- [ ] **Step 3: Verify script runs with empty input**

```bash
echo '{"tool_input":{"file_path":"test.txt"}}' | python3 plugins/markdown-format/hooks/scripts/format-markdown.py
# Expected: {}
```

- [ ] **Step 4: Commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): add script skeleton with stdin parsing"
```

---

## Chunk 2: Code Block Detection + First Fixers (Trailing Whitespace, List Markers)

### Task 2: Implement fenced code block region detection

**Files:**
- Modify: `plugins/markdown-format/hooks/scripts/fixers.py`
- Create: `plugins/markdown-format/hooks/scripts/test_fixers.py`

This is the critical invariant — all fixers depend on it. The function identifies line ranges inside fenced code blocks so fixers can skip them.

- [ ] **Step 1: Write failing tests for code block detection**

```python
#!/usr/bin/env python3
"""Tests for markdown fixers."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fixers import find_fenced_regions


def test_no_fences():
    text = "hello\nworld\n"
    assert find_fenced_regions(text) == []


def test_single_fence():
    text = "before\n```\ncode\n```\nafter\n"
    regions = find_fenced_regions(text)
    # Lines 1-3 (0-indexed) are the fenced block (including delimiters)
    assert regions == [(1, 3)]


def test_tilde_fence():
    text = "before\n~~~\ncode\n~~~\nafter\n"
    assert find_fenced_regions(text) == [(1, 3)]


def test_multiple_fences():
    text = "a\n```\nb\n```\nc\n```\nd\n```\ne\n"
    assert find_fenced_regions(text) == [(1, 3), (5, 7)]


def test_unclosed_fence():
    text = "a\n```\nb\nc\n"
    # Unclosed fence: treat rest of file as fenced
    assert find_fenced_regions(text) == [(1, 3)]


def test_indented_fence():
    text = "a\n   ```\ncode\n   ```\nb\n"
    assert find_fenced_regions(text) == [(1, 3)]


def test_fence_with_language():
    text = "a\n```python\ncode\n```\nb\n"
    assert find_fenced_regions(text) == [(1, 3)]


if __name__ == "__main__":
    for name, func in list(globals().items()):
        if name.startswith("test_"):
            try:
                func()
                print(f"  PASS: {name}")
            except AssertionError as e:
                print(f"  FAIL: {name}: {e}")
                sys.exit(1)
    print("All tests passed.")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
# Expected: ImportError (find_fenced_regions not defined)
```

- [ ] **Step 3: Implement find_fenced_regions**

```python
import re

def find_fenced_regions(content: str) -> list[tuple[int, int]]:
    """Find line index ranges of fenced code blocks (inclusive, 0-indexed).
    
    Returns list of (start_line, end_line) tuples including the fence delimiters.
    """
    lines = content.split("\n")
    regions = []
    fence_pattern = re.compile(r"^(\s{0,3})(```|~~~)")
    i = 0
    while i < len(lines):
        m = fence_pattern.match(lines[i])
        if m:
            fence_char = m.group(2)
            start = i
            i += 1
            # Find closing fence (same char, at least as many repetitions)
            close_pattern = re.compile(r"^\s{0,3}" + re.escape(fence_char))
            while i < len(lines):
                if close_pattern.match(lines[i]):
                    regions.append((start, i))
                    i += 1
                    break
                i += 1
            else:
                # Unclosed fence — treat to end of file
                regions.append((start, len(lines) - 1))
        else:
            i += 1
    return regions


def is_in_fenced_region(line_idx: int, regions: list[tuple[int, int]]) -> bool:
    """Check if a line index falls inside any fenced code block region."""
    return any(start <= line_idx <= end for start, end in regions)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
# Expected: All tests passed.
```

- [ ] **Step 5: Commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): implement fenced code block region detection"
```

---

### Task 3: Implement trailing whitespace fixer

**Files:**
- Modify: `plugins/markdown-format/hooks/scripts/fixers.py`
- Modify: `plugins/markdown-format/hooks/scripts/test_fixers.py`

- [ ] **Step 1: Write failing tests**

Add to `test_fixers.py`:

```python
from fixers import fix_trailing_whitespace


def test_trailing_spaces_removed():
    assert fix_trailing_whitespace("hello \nworld\n") == "hello\nworld\n"


def test_trailing_tabs_removed():
    assert fix_trailing_whitespace("hello\t\nworld\n") == "hello\nworld\n"


def test_preserve_double_space_linebreak():
    assert fix_trailing_whitespace("hello  \nworld\n") == "hello  \nworld\n"


def test_three_plus_spaces_reduced_to_two():
    assert fix_trailing_whitespace("hello     \nworld\n") == "hello  \nworld\n"


def test_no_change_needed():
    text = "hello\nworld\n"
    assert fix_trailing_whitespace(text) == text


def test_skip_fenced_code_blocks():
    text = "hello \n```\ncode   \n```\nworld \n"
    expected = "hello\n```\ncode   \n```\nworld\n"
    assert fix_trailing_whitespace(text) == expected
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
# Expected: ImportError (fix_trailing_whitespace not defined)
```

- [ ] **Step 3: Implement fix_trailing_whitespace**

```python
def fix_trailing_whitespace(content: str) -> str:
    """Remove trailing whitespace, preserving intentional double-space line breaks."""
    lines = content.split("\n")
    regions = find_fenced_regions(content)
    result = []
    for i, line in enumerate(lines):
        if is_in_fenced_region(i, regions):
            result.append(line)
            continue
        stripped = line.rstrip(" \t")
        trailing = line[len(stripped):]
        if len(trailing) == 2 and trailing == "  ":
            # Intentional line break — preserve
            result.append(line)
        elif len(trailing) >= 3 and all(c == " " for c in trailing):
            # Reduce to intentional double-space
            result.append(stripped + "  ")
        else:
            result.append(stripped)
    return "\n".join(result)
```

- [ ] **Step 4: Register in FIXERS list and run tests**

Uncomment `("trailing whitespace", fix_trailing_whitespace)` in the `FIXERS` list.

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
# Expected: All tests passed.
```

- [ ] **Step 5: Commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): implement trailing whitespace fixer"
```

---

### Task 4: Implement list marker fixer

**Files:**
- Modify: `plugins/markdown-format/hooks/scripts/fixers.py`
- Modify: `plugins/markdown-format/hooks/scripts/test_fixers.py`

- [ ] **Step 1: Write failing tests**

```python
from fixers import fix_list_markers


def test_asterisk_to_dash():
    assert fix_list_markers("* item\n") == "- item\n"


def test_plus_to_dash():
    assert fix_list_markers("+ item\n") == "- item\n"


def test_dash_unchanged():
    assert fix_list_markers("- item\n") == "- item\n"


def test_nested_list_preserves_indent():
    text = "* outer\n  * inner\n    * deep\n"
    expected = "- outer\n  - inner\n    - deep\n"
    assert fix_list_markers(text) == expected


def test_ordered_list_unchanged():
    text = "1. first\n2. second\n"
    assert fix_list_markers(text) == text


def test_asterisk_in_text_unchanged():
    # Bold text uses * but is not a list marker
    text = "This is **bold** text\n"
    assert fix_list_markers(text) == text


def test_skip_fenced_code_blocks():
    text = "* item\n```\n* not a list\n```\n* item2\n"
    expected = "- item\n```\n* not a list\n```\n- item2\n"
    assert fix_list_markers(text) == expected
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
# Expected: ImportError
```

- [ ] **Step 3: Implement fix_list_markers**

```python
def fix_list_markers(content: str) -> str:
    """Normalize unordered list markers (* and +) to -."""
    lines = content.split("\n")
    regions = find_fenced_regions(content)
    result = []
    # Match lines starting with optional whitespace then * or + followed by space
    marker_pattern = re.compile(r"^(\s*)([*+])(\s+)")
    for i, line in enumerate(lines):
        if is_in_fenced_region(i, regions):
            result.append(line)
            continue
        m = marker_pattern.match(line)
        if m:
            result.append(m.group(1) + "-" + m.group(3) + line[m.end():])
        else:
            result.append(line)
    return "\n".join(result)
```

- [ ] **Step 4: Register in FIXERS list and run tests**

Uncomment `("list markers", fix_list_markers)` in the `FIXERS` list.

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
# Expected: All tests passed.
```

- [ ] **Step 5: Commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): implement list marker fixer"
```

---

## Chunk 3: Spacing Fixers (Code Blocks, Headings)

### Task 5: Implement blank lines around fenced code blocks fixer

**Files:**
- Modify: `plugins/markdown-format/hooks/scripts/fixers.py`
- Modify: `plugins/markdown-format/hooks/scripts/test_fixers.py`

- [ ] **Step 1: Write failing tests**

```python
from fixers import fix_code_block_spacing


def test_add_blank_before_fence():
    text = "text\n```\ncode\n```\n"
    expected = "text\n\n```\ncode\n```\n"
    assert fix_code_block_spacing(text) == expected


def test_add_blank_after_fence():
    text = "```\ncode\n```\ntext\n"
    expected = "```\ncode\n```\n\ntext\n"
    assert fix_code_block_spacing(text) == expected


def test_no_blank_at_file_start():
    text = "```\ncode\n```\n"
    assert fix_code_block_spacing(text) == text


def test_collapse_multiple_blanks():
    text = "text\n\n\n```\ncode\n```\n\n\ntext\n"
    expected = "text\n\n```\ncode\n```\n\ntext\n"
    assert fix_code_block_spacing(text) == expected


def test_tilde_fences():
    text = "text\n~~~\ncode\n~~~\ntext\n"
    expected = "text\n\n~~~\ncode\n~~~\n\ntext\n"
    assert fix_code_block_spacing(text) == expected


def test_already_correct():
    text = "text\n\n```\ncode\n```\n\ntext\n"
    assert fix_code_block_spacing(text) == text
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

- [ ] **Step 3: Implement fix_code_block_spacing**

Two-pass approach: first identify fence openers/closers, then rebuild with correct spacing.

```python
def fix_code_block_spacing(content: str) -> str:
    """Ensure exactly one blank line before/after fenced code block delimiters."""
    lines = content.split("\n")
    fence_pattern = re.compile(r"^\s{0,3}(```|~~~)")

    # Pass 1: identify opener/closer line indices
    openers = set()
    closers = set()
    in_fence = False
    for i, line in enumerate(lines):
        if fence_pattern.match(line):
            if not in_fence:
                openers.add(i)
                in_fence = True
            else:
                closers.add(i)
                in_fence = False

    if not openers:
        return content

    # Pass 2: rebuild with correct blank line spacing
    result = []
    just_closed = False  # True right after appending a closer
    blank_after_close = False  # True after we've added the one blank after a closer

    for i, line in enumerate(lines):
        if i in openers:
            # Ensure exactly one blank line before (unless file start)
            just_closed = False
            blank_after_close = False
            if result:
                while result and result[-1] == "":
                    result.pop()
                if result:
                    result.append("")
            result.append(line)
        elif i in closers:
            result.append(line)
            just_closed = True
            blank_after_close = False
        elif just_closed:
            # First line after a closer
            just_closed = False
            if line == "":
                # Blank line — use it as the required blank
                result.append(line)
                blank_after_close = True
            else:
                # Non-blank — insert the required blank first
                result.append("")
                result.append(line)
                blank_after_close = True
        elif blank_after_close and line == "":
            # Extra blank lines after closer — skip them
            continue
        else:
            blank_after_close = False
            result.append(line)

    return "\n".join(result)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

- [ ] **Step 5: Register in FIXERS list and commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): implement code block spacing fixer"
```

---

### Task 6: Implement blank lines around headings fixer

**Files:**
- Modify: `plugins/markdown-format/hooks/scripts/fixers.py`
- Modify: `plugins/markdown-format/hooks/scripts/test_fixers.py`

- [ ] **Step 1: Write failing tests**

```python
from fixers import fix_heading_spacing


def test_add_blank_before_heading():
    text = "text\n## Heading\nmore\n"
    expected = "text\n\n## Heading\n\nmore\n"
    assert fix_heading_spacing(text) == expected


def test_no_blank_at_file_start():
    text = "# Title\ntext\n"
    expected = "# Title\n\ntext\n"
    assert fix_heading_spacing(text) == expected


def test_collapse_multiple_blanks():
    text = "text\n\n\n## Heading\n\n\nmore\n"
    expected = "text\n\n## Heading\n\nmore\n"
    assert fix_heading_spacing(text) == expected


def test_frontmatter_no_blank_injected():
    # Spec: no blank line injected between frontmatter closing --- and first heading
    text = "---\ntitle: Test\n---\n# Title\ntext\n"
    expected = "---\ntitle: Test\n---\n# Title\n\ntext\n"
    assert fix_heading_spacing(text) == expected


def test_consecutive_headings():
    text = "## Section\n### Subsection\ntext\n"
    expected = "## Section\n\n### Subsection\n\ntext\n"
    assert fix_heading_spacing(text) == expected


def test_heading_inside_fenced_block_unchanged():
    text = "```\n# Not a heading\n```\n"
    assert fix_heading_spacing(text) == text


def test_already_correct():
    text = "text\n\n## Heading\n\nmore\n"
    assert fix_heading_spacing(text) == text
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

- [ ] **Step 3: Implement fix_heading_spacing**

```python
def fix_heading_spacing(content: str) -> str:
    """Ensure exactly one blank line before/after headings.
    
    Exceptions:
    - No blank line added at file start
    - YAML frontmatter (--- delimited) is recognized — no extra blank between
      frontmatter closing --- and the first heading
    """
    lines = content.split("\n")
    regions = find_fenced_regions(content)
    heading_pattern = re.compile(r"^#{1,6}\s")
    
    # Detect YAML frontmatter
    frontmatter_end = -1
    if lines and lines[0] == "---":
        for i in range(1, len(lines)):
            if lines[i] == "---":
                frontmatter_end = i
                break

    result = []
    for i, line in enumerate(lines):
        if is_in_fenced_region(i, regions):
            result.append(line)
            continue
        
        # Inside frontmatter — pass through
        if frontmatter_end >= 0 and i <= frontmatter_end:
            result.append(line)
            continue

        if heading_pattern.match(line):
            # Ensure blank line before (unless file start or right after frontmatter)
            if result:
                while result and result[-1] == "":
                    result.pop()
                # Suppress blank line if previous content line is frontmatter closer
                if result and not (frontmatter_end >= 0 and result[-1] == "---"):
                    result.append("")
            result.append(line)
        else:
            # If previous line was a heading, ensure blank after
            if (result and i > 0 and not is_in_fenced_region(i - 1, regions)
                    and heading_pattern.match(lines[i - 1]) and line != ""):
                # Check: did we just add the heading? Ensure blank line
                if result[-1] != "":
                    result.append("")
                    result.append(line)
                else:
                    result.append(line)
            else:
                result.append(line)

    return "\n".join(result)
```

**Note to implementer:** The key edge case is YAML frontmatter. Detect `---` at line 0, find the closing `---`, and treat those lines as pass-through. Per the spec, do NOT inject a blank line between the frontmatter closing `---` and the first heading. The "ensure blank before headings" rule is suppressed when the previous non-blank line is the frontmatter closer.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

- [ ] **Step 5: Register in FIXERS list and commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): implement heading spacing fixer"
```

---

## Chunk 4: Table Alignment Fixer

### Task 7: Implement table alignment fixer

**Files:**
- Modify: `plugins/markdown-format/hooks/scripts/fixers.py`
- Modify: `plugins/markdown-format/hooks/scripts/test_fixers.py`

This is the most complex fixer. A markdown table consists of:
- Header row: `| Col1 | Col2 |`
- Delimiter row: `| --- | :---: |`
- Data rows: `| val1 | val2 |`

Detection: a table is a contiguous block of lines where the second line matches the delimiter pattern `|? *:?-+:? *|`.

- [ ] **Step 1: Write failing tests**

```python
from fixers import fix_tables


def test_basic_table_alignment():
    text = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 7 |\n"
    expected = "| Name  | Age |\n| ----- | --- |\n| Alice | 30  |\n| Bob   | 7   |\n"
    assert fix_tables(text) == expected


def test_preserve_alignment_markers():
    text = "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n"
    result = fix_tables(text)
    lines = result.strip().split("\n")
    delim = lines[1]
    # Check alignment markers are preserved
    cells = [c.strip() for c in delim.split("|")[1:-1]]
    assert cells[0].startswith(":")  # left
    assert cells[1].startswith(":") and cells[1].endswith(":")  # center
    assert cells[2].endswith(":")  # right


def test_malformed_row_fewer_columns():
    text = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |\n"
    result = fix_tables(text)
    # Row with fewer columns should be padded
    lines = result.strip().split("\n")
    assert lines[2].count("|") == 4  # 3 columns + outer pipes


def test_malformed_row_more_columns():
    text = "| A | B |\n| --- | --- |\n| 1 | 2 | 3 |\n"
    result = fix_tables(text)
    # Extra columns truncated to header count
    lines = result.strip().split("\n")
    assert lines[2].count("|") == 3  # 2 columns + outer pipes


def test_table_in_blockquote():
    text = "> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n"
    result = fix_tables(text)
    assert result.startswith("> |")


def test_table_in_fenced_block_unchanged():
    text = "```\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```\n"
    assert fix_tables(text) == text


def test_no_table():
    text = "Just some text\nMore text\n"
    assert fix_tables(text) == text


def test_table_with_surrounding_text():
    text = "Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter\n"
    result = fix_tables(text)
    assert result.startswith("Before")
    assert result.endswith("After\n")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

- [ ] **Step 3: Implement table detection**

Write a helper that identifies table blocks in the content:

```python
def _find_tables(lines: list[str], regions: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Find (start, end) line ranges of markdown tables (exclusive end).
    
    A table is detected when:
    - Line N has pipes
    - Line N+1 matches delimiter pattern (| --- | or similar)
    - Table continues while lines have pipes
    """
    delim_pattern = re.compile(
        r"^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$"
    )
    tables = []
    i = 0
    while i < len(lines) - 1:
        if is_in_fenced_region(i, regions):
            i += 1
            continue
        # Check if line i is a header and i+1 is a delimiter
        if "|" in lines[i] and delim_pattern.match(lines[i + 1].lstrip("> ")):
            start = i
            # Find end of table
            end = i + 2
            while end < len(lines) and "|" in lines[end] and not is_in_fenced_region(end, regions):
                end += 1
            tables.append((start, end))
            i = end
        else:
            i += 1
    return tables
```

- [ ] **Step 4: Implement table formatting**

```python
def _format_table(lines: list[str]) -> list[str]:
    """Format a single markdown table with aligned columns.
    
    Args:
        lines: list of table lines (header, delimiter, data rows)
    
    Returns:
        list of formatted lines
    """
    # Strip blockquote prefix if present
    prefix = ""
    if lines[0].lstrip().startswith(">"):
        # Detect blockquote prefix (e.g. "> " or ">> ")
        m = re.match(r"^(>\s*)+", lines[0])
        if m:
            prefix = m.group(0)
            lines = [line[len(prefix):] if line.startswith(prefix) else line for line in lines]

    # Parse cells
    def parse_row(line: str) -> list[str]:
        line = line.strip()
        if line.startswith("|"):
            line = line[1:]
        if line.endswith("|"):
            line = line[:-1]
        return [cell.strip() for cell in line.split("|")]

    header_cells = parse_row(lines[0])
    num_cols = len(header_cells)
    delim_cells = parse_row(lines[1])
    
    # Detect alignment from delimiter row
    alignments = []
    for i, cell in enumerate(delim_cells[:num_cols]):
        cell = cell.strip()
        if cell.startswith(":") and cell.endswith(":"):
            alignments.append("center")
        elif cell.endswith(":"):
            alignments.append("right")
        else:
            alignments.append("left")
    while len(alignments) < num_cols:
        alignments.append("left")

    # Parse all data rows, normalize column count
    all_rows = [header_cells]
    for line in lines[2:]:
        cells = parse_row(line)
        # Pad or truncate to num_cols
        cells = cells[:num_cols]
        while len(cells) < num_cols:
            cells.append("")
        all_rows.append(cells)

    # Calculate column widths
    col_widths = [3] * num_cols  # Minimum width of 3 for delimiter ---
    for row in all_rows:
        for j, cell in enumerate(row):
            col_widths[j] = max(col_widths[j], len(cell))

    # Format rows
    def format_row(cells: list[str]) -> str:
        parts = []
        for j, cell in enumerate(cells):
            parts.append(f" {cell.ljust(col_widths[j])} ")
        return "|" + "|".join(parts) + "|"

    def format_delim() -> str:
        parts = []
        for j in range(num_cols):
            width = col_widths[j]
            if alignments[j] == "center":
                parts.append(" :" + "-" * (width - 2) + ": ")
            elif alignments[j] == "right":
                parts.append(" " + "-" * (width - 1) + ": ")
            else:  # left
                parts.append(" " + "-" * width + " ")
        return "|" + "|".join(parts) + "|"

    result = [format_row(all_rows[0]), format_delim()]
    for row in all_rows[1:]:
        result.append(format_row(row))

    # Re-add blockquote prefix
    if prefix:
        result = [prefix + line for line in result]

    return result
```

- [ ] **Step 5: Implement fix_tables that ties detection + formatting together**

```python
def fix_tables(content: str) -> str:
    """Detect and reformat markdown tables."""
    lines = content.split("\n")
    regions = find_fenced_regions(content)
    tables = _find_tables(lines, regions)

    if not tables:
        return content

    # Process tables in reverse order to preserve line indices
    for start, end in reversed(tables):
        table_lines = lines[start:end]
        formatted = _format_table(table_lines)
        lines[start:end] = formatted

    return "\n".join(lines)
```

- [ ] **Step 6: Register in FIXERS list and run tests**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

- [ ] **Step 7: Commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): implement table alignment fixer"
```

---

## Chunk 5: Integration + Finalization

### Task 8: Wire up the full pipeline and run integration tests

**Files:**
- Modify: `plugins/markdown-format/hooks/scripts/fixers.py` (enable all fixers in FIXERS list)
- Modify: `plugins/markdown-format/hooks/scripts/test_fixers.py` (add pipeline integration tests)

- [ ] **Step 1: Ensure all fixers are registered in FIXERS list**

```python
FIXERS: list[tuple[str, callable]] = [
    ("table alignment", fix_tables),
    ("trailing whitespace", fix_trailing_whitespace),
    ("code block spacing", fix_code_block_spacing),
    ("heading spacing", fix_heading_spacing),
    ("list markers", fix_list_markers),
]
```

- [ ] **Step 2: Write integration test for run_pipeline**

```python
from fixers import run_pipeline


def test_pipeline_multiple_fixes():
    text = "# Title\ntext\n* item\n| A|B |\n| ---|--- |\n| 1|2 |\nmore   \n"
    result, fixes = run_pipeline(text)
    assert "table alignment" in fixes
    assert "trailing whitespace" in fixes
    assert "heading spacing" in fixes
    assert "list markers" in fixes
    # Verify the result is well-formatted
    assert "* " not in result  # list markers fixed
    assert "more   " not in result  # trailing ws fixed


def test_pipeline_no_fixes_needed():
    text = "# Title\n\nSome text.\n"
    result, fixes = run_pipeline(text)
    assert fixes == []
    assert result == text


def test_pipeline_fenced_blocks_protected():
    text = "```\n* item\n| bad|table |\ntrailing   \n```\n"
    result, fixes = run_pipeline(text)
    assert result == text  # Nothing changed inside fence
```

- [ ] **Step 3: Run all tests**

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

- [ ] **Step 4: Test the full hook script end-to-end**

Create a temp `.md` file with formatting issues, pipe simulated stdin to the script, check file was fixed and stdout contains systemMessage:

```bash
# Create test file
echo -e "# Title\ntext\n* item\nmore   " > /tmp/test-hook.md

# Simulate hook call
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/test-hook.md"}}' | \
  python3 plugins/markdown-format/hooks/scripts/format-markdown.py

# Check output was JSON with systemMessage
# Check file was fixed
cat /tmp/test-hook.md
rm /tmp/test-hook.md
```

- [ ] **Step 5: Commit**

```bash
git add plugins/markdown-format/hooks/scripts/
git commit -m "feat(markdown-format): wire up full pipeline with integration tests"
```

---

### Task 9: Update marketplace.json and finalize

**Files:**
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Run the marketplace generator**

```bash
./scripts/generate-marketplace.sh
```

- [ ] **Step 2: Verify marketplace.json includes the new plugin**

Check that `markdown-format` appears in the marketplace JSON with correct metadata.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "chore: add markdown-format plugin to marketplace"
```

- [ ] **Step 4: Final verification**

Run the full test suite one more time:

```bash
cd plugins/markdown-format/hooks/scripts && python3 test_fixers.py
```

Verify the plugin structure matches the spec:

```bash
find plugins/markdown-format -type f | sort
```

Expected:
```
plugins/markdown-format/.claude-plugin/plugin.json
plugins/markdown-format/LICENSE
plugins/markdown-format/README.md
plugins/markdown-format/hooks/hooks.json
plugins/markdown-format/hooks/scripts/fixers.py
plugins/markdown-format/hooks/scripts/format-markdown.py
plugins/markdown-format/hooks/scripts/test_fixers.py
```
