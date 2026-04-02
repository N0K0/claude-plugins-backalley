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
        if not stripped:
            # Whitespace-only line — strip completely
            result.append("")
        elif len(trailing) == 2 and trailing == "  ":
            # Intentional line break — preserve
            result.append(line)
        elif len(trailing) >= 3 and all(c == " " for c in trailing):
            # Reduce to intentional double-space
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
    just_after_heading = False  # True after emitting a heading line

    for i, line in enumerate(lines):
        if is_in_fenced_region(i, regions):
            just_after_heading = False
            result.append(line)
            continue

        if frontmatter_end >= 0 and i <= frontmatter_end:
            just_after_heading = False
            result.append(line)
            continue

        if heading_pattern.match(line):
            just_after_heading = False
            if result:
                while result and result[-1] == "":
                    result.pop()
                # Suppress blank line if previous content line is frontmatter closer
                if result and not (frontmatter_end >= 0 and result[-1] == "---"):
                    result.append("")
            result.append(line)
            just_after_heading = True
        elif just_after_heading:
            if line == "":
                # Suppress extra blanks after heading; we'll add exactly one
                # when we encounter the first non-blank line
                continue
            else:
                # First non-blank line after heading: ensure exactly one blank
                result.append("")
                result.append(line)
                just_after_heading = False
        else:
            result.append(line)

    return "\n".join(result)


def _find_tables(lines, regions):
    """Find (start, end) line ranges of markdown tables (exclusive end)."""
    delim_pattern = re.compile(r"^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$")
    tables = []
    i = 0
    while i < len(lines) - 1:
        if is_in_fenced_region(i, regions):
            i += 1
            continue
        if "|" in lines[i] and delim_pattern.match(lines[i + 1].lstrip("> ")):
            start = i
            end = i + 2
            while end < len(lines) and "|" in lines[end] and not is_in_fenced_region(end, regions):
                end += 1
            tables.append((start, end))
            i = end
        else:
            i += 1
    return tables


def _format_table(lines):
    """Format a list of table lines with aligned columns."""
    prefix = ""
    if lines[0].lstrip().startswith(">"):
        m = re.match(r"^(>\s*)+", lines[0])
        if m:
            prefix = m.group(0)
            lines = [line[len(prefix):] if line.startswith(prefix) else line for line in lines]

    def parse_row(line):
        line = line.strip()
        if line.startswith("|"):
            line = line[1:]
        if line.endswith("|"):
            line = line[:-1]
        return [cell.strip() for cell in line.split("|")]

    header_cells = parse_row(lines[0])
    num_cols = len(header_cells)
    delim_cells = parse_row(lines[1])

    alignments = []
    for i, cell in enumerate(delim_cells[:num_cols]):
        cell = cell.strip()
        if cell.startswith(":") and cell.endswith(":"):
            alignments.append("center")
        elif cell.endswith(":"):
            alignments.append("right")
        elif cell.startswith(":"):
            alignments.append("left-explicit")
        else:
            alignments.append("left")
    while len(alignments) < num_cols:
        alignments.append("left")

    all_rows = [header_cells]
    for line in lines[2:]:
        cells = parse_row(line)
        cells = cells[:num_cols]
        while len(cells) < num_cols:
            cells.append("")
        all_rows.append(cells)

    col_widths = [3] * num_cols
    for row in all_rows:
        for j, cell in enumerate(row):
            col_widths[j] = max(col_widths[j], len(cell))

    def format_row(cells):
        parts = []
        for j, cell in enumerate(cells):
            parts.append(f" {cell.ljust(col_widths[j])} ")
        return "|" + "|".join(parts) + "|"

    def format_delim():
        parts = []
        for j in range(num_cols):
            width = col_widths[j]
            if alignments[j] == "center":
                parts.append(" :" + "-" * (width - 2) + ": ")
            elif alignments[j] == "right":
                parts.append(" " + "-" * (width - 1) + ": ")
            elif alignments[j] == "left-explicit":
                parts.append(" :" + "-" * (width - 1) + " ")
            else:
                parts.append(" " + "-" * width + " ")
        return "|" + "|".join(parts) + "|"

    result = [format_row(all_rows[0]), format_delim()]
    for row in all_rows[1:]:
        result.append(format_row(row))

    if prefix:
        result = [prefix + line for line in result]
    return result


def fix_tables(content: str) -> str:
    """Align markdown table columns."""
    lines = content.split("\n")
    regions = find_fenced_regions(content)
    tables = _find_tables(lines, regions)
    if not tables:
        return content
    for start, end in reversed(tables):
        table_lines = lines[start:end]
        formatted = _format_table(table_lines)
        lines[start:end] = formatted
    return "\n".join(lines)


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
    ("table alignment", fix_tables),
    ("trailing whitespace", fix_trailing_whitespace),
    ("code block spacing", fix_code_block_spacing),
    ("heading spacing", fix_heading_spacing),
    ("list markers", fix_list_markers),
]
