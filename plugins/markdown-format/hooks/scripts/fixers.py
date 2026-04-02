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
