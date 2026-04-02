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
