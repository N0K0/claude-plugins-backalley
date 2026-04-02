#!/usr/bin/env python3
"""Markdown formatting fixers. Each fixer is str -> str."""

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
            close_pattern = re.compile(r"^\s{0,3}" + re.escape(fence_char))
            while i < len(lines):
                if close_pattern.match(lines[i]):
                    regions.append((start, i))
                    i += 1
                    break
                i += 1
            else:
                # Exclude trailing empty string produced by a final newline
                last = len(lines) - 1
                if last > start and lines[last] == "":
                    last -= 1
                regions.append((start, last))
        else:
            i += 1
    return regions


def is_in_fenced_region(line_idx: int, regions: list[tuple[int, int]]) -> bool:
    """Check if a line index falls inside any fenced code block region."""
    return any(start <= line_idx <= end for start, end in regions)


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
            result.append(line)
        elif len(trailing) >= 3 and all(c == " " for c in trailing):
            result.append(stripped + "  ")
        else:
            result.append(stripped)
    return "\n".join(result)


def fix_list_markers(content: str) -> str:
    """Normalize unordered list markers (* and +) to -."""
    lines = content.split("\n")
    regions = find_fenced_regions(content)
    result = []
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
    just_closed = False
    blanks_after_close = 0  # count of blank lines emitted after a closer

    for i, line in enumerate(lines):
        if i in openers:
            just_closed = False
            blanks_after_close = 0
            if result:
                while result and result[-1] == "":
                    result.pop()
                if result:
                    result.append("")
            result.append(line)
        elif i in closers:
            result.append(line)
            just_closed = True
            blanks_after_close = 0
        elif just_closed:
            just_closed = False
            if line == "":
                result.append(line)
                blanks_after_close = 1
            else:
                result.append("")
                result.append(line)
                blanks_after_close = 1
        elif blanks_after_close > 0 and line == "":
            # Suppress extra blank lines after closer, but only if we're not at
            # the final sentinel empty string (i.e. there are more lines after this)
            if i < len(lines) - 1:
                continue  # Skip extra blank lines after closer
            else:
                result.append(line)  # Preserve trailing newline sentinel
        else:
            blanks_after_close = 0
            result.append(line)

    return "\n".join(result)


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
    ("trailing whitespace", fix_trailing_whitespace),
    ("code block spacing", fix_code_block_spacing),
    # ("heading spacing", fix_heading_spacing),
    ("list markers", fix_list_markers),
]
