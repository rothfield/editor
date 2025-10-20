"""
Direct verification test for Return key functionality.
This test forces cache clearing and directly tests the feature.
"""

import pytest
import time
from playwright.sync_api import Page, sync_playwright, Browser


class TestReturnKeyWorking:
    """Verify Return key feature actually works."""

    @pytest.fixture
    def page(self):
        """Create a fresh browser page with cache disabled."""
        with sync_playwright() as p:
            # Launch browser with cache disabled
            browser = p.chromium.launch(
                args=[
                    '--disable-cache',
                    '--disable-blink-features=AutomationControlled'
                ]
            )

            context = browser.new_context(
                # Disable caching
                extra_http_headers={
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            )

            page = context.new_page()

            yield page

            context.close()
            browser.close()

    def test_return_key_working_simple(self, page: Page):
        """Test that Return key actually splits the line."""
        print("\n=== Testing Return Key Feature ===")

        # Load the main editor
        print("Loading http://localhost:8080")
        page.goto("http://localhost:8080?t=" + str(int(time.time())), wait_until="domcontentloaded")

        # Wait for canvas and editor to load
        print("Waiting for editor canvas...")
        canvas = page.wait_for_selector("#notation-editor", timeout=10000)
        assert canvas is not None, "Canvas should be present"
        print("✓ Canvas found")

        # Focus the editor
        print("Focusing editor...")
        page.click("#notation-editor")
        page.wait_for_timeout(300)

        # Type some content
        print("Typing '123'...")
        page.keyboard.type("123")
        page.wait_for_timeout(300)

        # Verify content was typed
        print("Verifying initial content...")
        initial_state = page.evaluate("""() => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Editor not ready' };
            }
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                line0_content: doc.lines[0].cells.map(c => c.char).join(''),
                cursor_stave: doc.state.cursor.stave,
                cursor_column: doc.state.cursor.column
            };
        }""")

        print(f"Initial state: {initial_state}")
        assert initial_state.get('lines') == 1, f"Should have 1 line, got {initial_state}"
        assert initial_state.get('line0_content') == '123', f"Should have '123', got {initial_state}"
        print("✓ Initial content correct")

        # Move cursor to middle (position 2)
        print("Moving cursor to position 2 (between '12' and '3')...")
        page.keyboard.press("Home")
        page.wait_for_timeout(100)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(50)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(100)

        # Verify cursor position
        cursor_check = page.evaluate("""() => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return null;
            }
            const doc = window.musicEditor.theDocument;
            return {
                cursor_stave: doc.state.cursor.stave,
                cursor_column: doc.state.cursor.column
            };
        }""")
        print(f"Cursor before Return: {cursor_check}")

        # Now press Return
        print("🔄 Pressing Return key...")

        # Set up a listener for any debug logs
        page.evaluate("""() => {
            window.pressedReturn = false;
            const origLog = console.log;
            console.log = function(...args) {
                if (args.some(a => String(a).includes('🔄'))) {
                    window.pressedReturn = true;
                    origLog('[INTERCEPTED RETURN LOG]', ...args);
                }
                return origLog.apply(console, args);
            };
        }""")

        page.keyboard.press("Enter")
        page.wait_for_timeout(800)

        # Check if Return was processed
        returned = page.evaluate("() => window.pressedReturn || false")
        print(f"Return processed (log detected): {returned}")

        # Check the final state
        print("Checking final state after Return...")
        final_state = page.evaluate("""() => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Editor not ready' };
            }
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                line0_content: doc.lines[0].cells.map(c => c.char).join(''),
                line1_content: doc.lines[1] ? doc.lines[1].cells.map(c => c.char).join('') : '',
                cursor_stave: doc.state.cursor.stave,
                cursor_column: doc.state.cursor.column
            };
        }""")

        print(f"Final state: {final_state}")

        # Verify the split happened
        assert final_state.get('lines') == 2, f"Should have 2 lines after Return, got {final_state.get('lines')}"
        assert final_state.get('line0_content') == '12', f"Line 0 should be '12', got '{final_state.get('line0_content')}'"
        assert final_state.get('line1_content') == '3', f"Line 1 should be '3', got '{final_state.get('line1_content')}'"
        assert final_state.get('cursor_stave') == 1, f"Cursor should be on line 1, got {final_state.get('cursor_stave')}"
        assert final_state.get('cursor_column') == 0, f"Cursor should be at column 0, got {final_state.get('cursor_column')}"

        print("✅ Return key feature is WORKING!")
        print("   - Line split correctly")
        print("   - Content distributed properly")
        print("   - Cursor moved to new line")

    def test_return_key_at_start(self, page: Page):
        """Test Return key at start of line."""
        print("\n=== Testing Return at Start ===")

        page.goto("http://localhost:8080?t=" + str(int(time.time())), wait_until="domcontentloaded")
        page.wait_for_selector("#notation-editor", timeout=10000)

        page.click("#notation-editor")
        page.wait_for_timeout(300)

        page.keyboard.type("123")
        page.wait_for_timeout(300)

        # Move to start
        page.keyboard.press("Home")
        page.wait_for_timeout(100)

        # Press Return
        page.keyboard.press("Enter")
        page.wait_for_timeout(800)

        # Verify
        result = page.evaluate("""() => {
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                line0: doc.lines[0].cells.map(c => c.char).join(''),
                line1: doc.lines[1].cells.map(c => c.char).join('')
            };
        }""")

        print(f"Result: {result}")
        assert result['lines'] == 2
        assert result['line0'] == '', f"Line 0 should be empty, got '{result['line0']}'"
        assert result['line1'] == '123', f"Line 1 should be '123', got '{result['line1']}'"
        print("✅ Return at start works!")

    def test_return_key_at_end(self, page: Page):
        """Test Return key at end of line."""
        print("\n=== Testing Return at End ===")

        page.goto("http://localhost:8080?t=" + str(int(time.time())), wait_until="domcontentloaded")
        page.wait_for_selector("#notation-editor", timeout=10000)

        page.click("#notation-editor")
        page.wait_for_timeout(300)

        page.keyboard.type("123")
        page.wait_for_timeout(300)

        # Move to end
        page.keyboard.press("End")
        page.wait_for_timeout(100)

        # Press Return
        page.keyboard.press("Enter")
        page.wait_for_timeout(800)

        # Verify
        result = page.evaluate("""() => {
            const doc = window.musicEditor.theDocument;
            return {
                lines: doc.lines.length,
                line0: doc.lines[0].cells.map(c => c.char).join(''),
                line1: doc.lines[1].cells.map(c => c.char).join('')
            };
        }""")

        print(f"Result: {result}")
        assert result['lines'] == 2
        assert result['line0'] == '123', f"Line 0 should be '123', got '{result['line0']}'"
        assert result['line1'] == '', f"Line 1 should be empty, got '{result['line1']}'"
        print("✅ Return at end works!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
