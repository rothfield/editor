"""
Synchronous E2E test for Return key line splitting using pytest-playwright
"""

import pytest
from playwright.sync_api import Page, expect


class TestReturnKeySync:
    """Synchronous Playwright tests for Return key functionality."""

    def test_dev_server_ready(self, page: Page):
        """Test that dev server is accessible."""
        page.goto("http://localhost:8080", wait_until="domcontentloaded")
        title = page.title()
        assert title is not None, "Page should load"
        print(f"✓ Dev server loaded: {title}")

    def test_editor_initializes(self, page: Page):
        """Test that editor initializes."""
        page.goto("http://localhost:8080", wait_until="domcontentloaded")

        # Wait for editor to exist
        editor_canvas = page.wait_for_selector("#notation-canvas", timeout=5000)
        assert editor_canvas is not None, "Editor canvas should exist"
        print("✓ Editor canvas exists")

    def test_return_key_split_at_start(self, page: Page):
        """Test splitting at start of line."""
        page.goto("http://localhost:8080", wait_until="domcontentloaded")

        # Click editor to focus
        page.click("#notation-canvas")
        page.wait_for_timeout(100)

        # Type content
        page.keyboard.type("123")
        page.wait_for_timeout(200)

        # Verify content
        doc_state = page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Not ready' };
            }
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                content: doc.lines[0].cells.map(c => c.char).join('')
            };
        }
        """)

        assert doc_state["lines"] == 1, "Should have 1 line"
        assert doc_state["content"] == "123", "Should have content '123'"
        print("✓ Initial content typed correctly")

        # Move cursor to start
        page.keyboard.press("Home")
        page.wait_for_timeout(100)

        # Press Return
        page.keyboard.press("Enter")
        page.wait_for_timeout(500)

        # Check result
        result = page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Not ready' };
            }
            const doc = window.musicEditor.theDocument;
            const cursor = doc.state.cursor;
            return {
                lines: doc.lines.length,
                line0: doc.lines[0].cells.map(c => c.char).join(''),
                line1: doc.lines[1] ? doc.lines[1].cells.map(c => c.char).join('') : '',
                current_stave: cursor.stave,
                current_col: cursor.column
            };
        }
        """)

        assert result["lines"] == 2, f"Should have 2 lines, got {result['lines']}"
        assert result["line0"] == "", f"Line 0 should be empty, got '{result['line0']}'"
        assert result["line1"] == "123", f"Line 1 should have '123', got '{result['line1']}'"
        assert result["current_stave"] == 1, f"Cursor should be on stave 1, got {result['current_stave']}"
        assert result["current_col"] == 0, f"Cursor should be at col 0, got {result['current_col']}"
        print("✓ Return key split at start works correctly")

    def test_return_key_split_in_middle(self, page: Page):
        """Test splitting in middle of line."""
        page.goto("http://localhost:8080", wait_until="domcontentloaded")

        # Click editor to focus
        page.click("#notation-canvas")
        page.wait_for_timeout(100)

        # Type content: "12345"
        page.keyboard.type("12345")
        page.wait_for_timeout(200)

        # Move cursor to position 2 (between "12" and "345")
        page.keyboard.press("Home")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(100)

        # Press Return
        page.keyboard.press("Enter")
        page.wait_for_timeout(500)

        # Check result
        result = page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Not ready' };
            }
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                line0: doc.lines[0].cells.map(c => c.char).join(''),
                line1: doc.lines[1].cells.map(c => c.char).join('')
            };
        }
        """)

        assert result["lines"] == 2, f"Should have 2 lines, got {result['lines']}"
        assert result["line0"] == "12", f"Line 0 should be '12', got '{result['line0']}'"
        assert result["line1"] == "345", f"Line 1 should be '345', got '{result['line1']}'"
        print("✓ Return key split in middle works correctly")

    def test_return_key_split_at_end(self, page: Page):
        """Test splitting at end of line."""
        page.goto("http://localhost:8080", wait_until="domcontentloaded")

        # Click editor to focus
        page.click("#notation-canvas")
        page.wait_for_timeout(100)

        # Type content: "123"
        page.keyboard.type("123")
        page.wait_for_timeout(200)

        # Move cursor to end
        page.keyboard.press("End")
        page.wait_for_timeout(100)

        # Press Return
        page.keyboard.press("Enter")
        page.wait_for_timeout(500)

        # Check result
        result = page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Not ready' };
            }
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                line0: doc.lines[0].cells.map(c => c.char).join(''),
                line1: doc.lines[1].cells.map(c => c.char).join(''),
                stave: doc.state.cursor.stave
            };
        }
        """)

        assert result["lines"] == 2, f"Should have 2 lines, got {result['lines']}"
        assert result["line0"] == "123", f"Line 0 should be '123', got '{result['line0']}'"
        assert result["line1"] == "", f"Line 1 should be empty, got '{result['line1']}'"
        assert result["stave"] == 1, f"Cursor should be on stave 1, got {result['stave']}"
        print("✓ Return key split at end works correctly")

    def test_return_key_multiple_splits(self, page: Page):
        """Test multiple consecutive splits."""
        page.goto("http://localhost:8080", wait_until="domcontentloaded")

        # Click editor to focus
        page.click("#notation-canvas")
        page.wait_for_timeout(100)

        # Type content: "1234567"
        page.keyboard.type("1234567")
        page.wait_for_timeout(200)

        # Split 1: position 2
        page.keyboard.press("Home")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(100)
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)

        # Split 2: on new line at position 2
        page.keyboard.press("Home")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(100)
        page.keyboard.press("Enter")
        page.wait_for_timeout(300)

        # Check result
        result = page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Not ready' };
            }
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                line0: doc.lines[0].cells.map(c => c.char).join(''),
                line1: doc.lines[1].cells.map(c => c.char).join(''),
                line2: doc.lines[2].cells.map(c => c.char).join('')
            };
        }
        """)

        assert result["lines"] == 3, f"Should have 3 lines, got {result['lines']}"
        assert result["line0"] == "12", f"Line 0 should be '12', got '{result['line0']}'"
        assert result["line1"] == "34", f"Line 1 should be '34', got '{result['line1']}'"
        assert result["line2"] == "567", f"Line 2 should be '567', got '{result['line2']}'"
        print("✓ Return key multiple splits work correctly")
