"""
Test for Return key state preservation bug.
This test verifies that the state.cursor object is preserved when splitting lines.

Previously, splitLineAtPosition would return a document without the JavaScript-only
state property, causing "Cannot read properties of undefined (reading 'cursor')" error.
"""

import pytest
from playwright.async_api import Page


class TestReturnKeyStateBug:
    """Verify Return key preserves state.cursor after line split."""

    @pytest.mark.asyncio
    async def test_return_key_preserves_state_cursor(self, page: Page, development_server):
        """
        Verify Return key preserves state.cursor

        This test verifies that the state.cursor object exists after the Return key
        splits a line. The bug was that WASM's splitLineAtPosition returns a new
        document without the JavaScript-only state property.
        """
        print("\n=== Testing Return Key State Preservation ===")

        # Navigate to editor
        print("Loading editor...")
        await page.goto(development_server, wait_until="domcontentloaded")

        # Wait for editor element
        print("Waiting for editor...")
        await page.wait_for_selector("#notation-editor", timeout=10000)

        # Wait for WASM to initialize
        print("Waiting for WASM initialization...")
        await page.wait_for_function(
            "window.musicEditor && window.musicEditor.isInitialized",
            timeout=10000
        )

        # Focus editor
        print("Focusing editor...")
        await page.click("#notation-editor")
        await page.wait_for_timeout(300)

        # Type content
        print("Typing '1'...")
        await page.keyboard.type("1")
        await page.wait_for_timeout(300)

        # Verify initial state exists
        print("Verifying initial state...")
        initial_state = await page.evaluate("""() => {
            const doc = window.musicEditor.theDocument;
            if (!doc.state || !doc.state.cursor) {
                throw new Error('Initial state missing!');
            }
            return {
                has_state: !!doc.state,
                has_cursor: !!doc.state.cursor,
                cursor_stave: doc.state.cursor.stave,
                cursor_column: doc.state.cursor.column,
                lines: doc.lines.length
            };
        }""")

        print(f"Initial state: {initial_state}")
        assert initial_state['has_state'], "Initial state should exist"
        assert initial_state['has_cursor'], "Initial cursor should exist"
        assert initial_state['cursor_stave'] == 0, "Should be on stave 0"
        assert initial_state['cursor_column'] == 1, "Should be at column 1 after typing '1'"
        assert initial_state['lines'] == 1, "Should have 1 line"

        # Now press Return - this is where the bug occurs
        print("🔄 Pressing Return key (this is where bug occurs)...")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(800)

        # Verify state.cursor still exists after Return
        print("Verifying state.cursor preserved after Return...")
        final_state = await page.evaluate("""() => {
            const doc = window.musicEditor.theDocument;

            // This is the critical check - state.cursor should exist
            if (!doc.state) {
                return {
                    success: false,
                    error: 'state property is undefined',
                    has_state: false,
                    has_cursor: false
                };
            }

            if (!doc.state.cursor) {
                return {
                    success: false,
                    error: 'state.cursor is undefined',
                    has_state: true,
                    has_cursor: false
                };
            }

            return {
                success: true,
                has_state: true,
                has_cursor: true,
                cursor_stave: doc.state.cursor.stave,
                cursor_column: doc.state.cursor.column,
                lines: doc.lines.length,
                line0_cells: doc.lines[0].cells.length,
                line1_cells: doc.lines[1] ? doc.lines[1].cells.length : 0
            };
        }""")

        print(f"Final state: {final_state}")

        # Key assertion - state.cursor must exist
        if not final_state.get('success'):
            print(f"❌ ERROR: {final_state.get('error')}")
            raise AssertionError(
                f"State not preserved after Return: {final_state.get('error')}"
            )

        # Verify the line was actually split
        assert final_state['lines'] == 2, f"Should have 2 lines, got {final_state['lines']}"
        assert final_state['cursor_stave'] == 1, f"Cursor should be on stave 1, got {final_state['cursor_stave']}"
        assert final_state['cursor_column'] == 0, f"Cursor should be at column 0, got {final_state['cursor_column']}"

        print("✅ Return key state preservation works!")
        print(f"   - State preserved: {final_state['has_state']}")
        print(f"   - Cursor preserved: {final_state['has_cursor']}")
        print(f"   - Cursor position: stave={final_state['cursor_stave']}, column={final_state['cursor_column']}")
        print(f"   - Lines split correctly: {final_state['lines']}")

    @pytest.mark.asyncio
    async def test_return_key_no_console_errors(self, page: Page, development_server):
        """
        Verify Return key doesn't cause console errors.

        The bug produces: "Cannot read properties of undefined (reading 'cursor')"
        """
        print("\n=== Testing Return Key Console Errors ===")

        # Track console errors
        console_errors = []
        await page.evaluate("""() => {
            window.__consoleErrors = [];
            const origError = console.error;
            console.error = function(...args) {
                window.__consoleErrors.push(args.join(' '));
                return origError.apply(console, args);
            };
        }""")

        # Load and setup
        await page.goto(development_server, wait_until="domcontentloaded")
        await page.wait_for_selector("#notation-editor", timeout=10000)
        await page.wait_for_function(
            "window.musicEditor && window.musicEditor.isInitialized",
            timeout=10000
        )

        # Focus and type
        await page.click("#notation-editor")
        await page.wait_for_timeout(300)
        await page.keyboard.type("1")
        await page.wait_for_timeout(300)

        # Press Return
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(800)

        # Check for errors
        errors = await page.evaluate("() => window.__consoleErrors || []")

        # Filter for the specific bug we're fixing
        state_errors = [e for e in errors if 'Cannot read properties of undefined' in e and 'cursor' in e]

        if state_errors:
            print(f"❌ Found state.cursor errors: {state_errors}")
            raise AssertionError(f"state.cursor error occurred: {state_errors[0]}")

        print("✅ No state.cursor errors!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
