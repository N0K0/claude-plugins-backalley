#!/usr/bin/env python3
"""Tests for markdown fixers."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fixers import find_fenced_regions, fix_trailing_whitespace, fix_list_markers, fix_code_block_spacing, fix_heading_spacing, fix_tables


def test_no_fences():
    text = "hello\nworld\n"
    assert find_fenced_regions(text) == []


def test_single_fence():
    text = "before\n```\ncode\n```\nafter\n"
    regions = find_fenced_regions(text)
    assert regions == [(1, 3)]


def test_tilde_fence():
    text = "before\n~~~\ncode\n~~~\nafter\n"
    assert find_fenced_regions(text) == [(1, 3)]


def test_multiple_fences():
    text = "a\n```\nb\n```\nc\n```\nd\n```\ne\n"
    assert find_fenced_regions(text) == [(1, 3), (5, 7)]


def test_unclosed_fence():
    text = "a\n```\nb\nc\n"
    assert find_fenced_regions(text) == [(1, 3)]


def test_indented_fence():
    text = "a\n   ```\ncode\n   ```\nb\n"
    assert find_fenced_regions(text) == [(1, 3)]


def test_fence_with_language():
    text = "a\n```python\ncode\n```\nb\n"
    assert find_fenced_regions(text) == [(1, 3)]


def test_trailing_spaces_removed():
    assert fix_trailing_whitespace("hello \nworld\n") == "hello\nworld\n"

def test_trailing_tabs_removed():
    assert fix_trailing_whitespace("hello\t\nworld\n") == "hello\nworld\n"

def test_preserve_double_space_linebreak():
    assert fix_trailing_whitespace("hello  \nworld\n") == "hello  \nworld\n"

def test_three_plus_spaces_reduced_to_two():
    assert fix_trailing_whitespace("hello     \nworld\n") == "hello  \nworld\n"

def test_ws_no_change_needed():
    text = "hello\nworld\n"
    assert fix_trailing_whitespace(text) == text

def test_ws_skip_fenced_code_blocks():
    text = "hello \n```\ncode   \n```\nworld \n"
    expected = "hello\n```\ncode   \n```\nworld\n"
    assert fix_trailing_whitespace(text) == expected

def test_whitespace_only_line_stripped():
    assert fix_trailing_whitespace("hello\n   \nworld\n") == "hello\n\nworld\n"


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
    text = "This is **bold** text\n"
    assert fix_list_markers(text) == text

def test_lm_skip_fenced_code_blocks():
    text = "* item\n```\n* not a list\n```\n* item2\n"
    expected = "- item\n```\n* not a list\n```\n- item2\n"
    assert fix_list_markers(text) == expected


def test_add_blank_before_fence():
    text = "text\n```\ncode\n```\n"
    expected = "text\n\n```\ncode\n```\n"
    assert fix_code_block_spacing(text) == expected

def test_add_blank_after_fence():
    text = "```\ncode\n```\ntext\n"
    expected = "```\ncode\n```\n\ntext\n"
    assert fix_code_block_spacing(text) == expected

def test_cbs_no_blank_at_file_start():
    text = "```\ncode\n```\n"
    assert fix_code_block_spacing(text) == text

def test_collapse_multiple_blanks():
    text = "text\n\n\n```\ncode\n```\n\n\ntext\n"
    expected = "text\n\n```\ncode\n```\n\ntext\n"
    assert fix_code_block_spacing(text) == expected

def test_tilde_fences_spacing():
    text = "text\n~~~\ncode\n~~~\ntext\n"
    expected = "text\n\n~~~\ncode\n~~~\n\ntext\n"
    assert fix_code_block_spacing(text) == expected

def test_cbs_already_correct():
    text = "text\n\n```\ncode\n```\n\ntext\n"
    assert fix_code_block_spacing(text) == text


def test_add_blank_before_heading():
    text = "text\n## Heading\nmore\n"
    expected = "text\n\n## Heading\n\nmore\n"
    assert fix_heading_spacing(text) == expected

def test_hs_no_blank_at_file_start():
    text = "# Title\ntext\n"
    expected = "# Title\n\ntext\n"
    assert fix_heading_spacing(text) == expected

def test_hs_collapse_multiple_blanks():
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

def test_hs_already_correct():
    text = "text\n\n## Heading\n\nmore\n"
    assert fix_heading_spacing(text) == text


def test_basic_table_alignment():
    text = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 7 |\n"
    expected = "| Name  | Age |\n| ----- | --- |\n| Alice | 30  |\n| Bob   | 7   |\n"
    assert fix_tables(text) == expected

def test_preserve_alignment_markers():
    text = "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n"
    result = fix_tables(text)
    lines = result.strip().split("\n")
    delim = lines[1]
    cells = [c.strip() for c in delim.split("|")[1:-1]]
    assert cells[0].startswith(":")  # left
    assert cells[1].startswith(":") and cells[1].endswith(":")  # center
    assert cells[2].endswith(":")  # right

def test_malformed_row_fewer_columns():
    text = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |\n"
    result = fix_tables(text)
    lines = result.strip().split("\n")
    assert lines[2].count("|") == 4  # 3 columns + outer pipes

def test_malformed_row_more_columns():
    text = "| A | B |\n| --- | --- |\n| 1 | 2 | 3 |\n"
    result = fix_tables(text)
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


from fixers import run_pipeline

def test_pipeline_multiple_fixes():
    text = "# Title\ntext\n* item\n| A|B |\n| ---|--- |\n| 1|2 |\nmore   \n"
    result, fixes = run_pipeline(text)
    assert "table alignment" in fixes
    assert "trailing whitespace" in fixes
    assert "heading spacing" in fixes
    assert "list markers" in fixes
    assert "* " not in result
    assert "more   " not in result

def test_pipeline_no_fixes_needed():
    text = "# Title\n\nSome text.\n"
    result, fixes = run_pipeline(text)
    assert fixes == []
    assert result == text

def test_pipeline_fenced_blocks_protected():
    text = "```\n* item\n| bad|table |\ntrailing   \n```\n"
    result, fixes = run_pipeline(text)
    assert result == text


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
