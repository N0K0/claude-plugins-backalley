#!/usr/bin/env python3
"""Tests for markdown fixers."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fixers import find_fenced_regions, fix_trailing_whitespace, fix_list_markers, fix_code_block_spacing


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
