#!/usr/bin/env python3
"""Tests for markdown fixers."""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fixers import find_fenced_regions, fix_trailing_whitespace


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
