"""
Simple test for Return key state preservation bug fix.
This test directly uses Playwright without complex fixtures.
"""

import pytest
import asyncio
from playwright.async_api import async_playwright


@pytest.mark.asyncio
async def test_return_key_state_preserved():
    """
    Test that Return key preserves state.cursor after line split.

    This directly tests the fix without fixture complexity.
    """
    print("\n=== Testing Return Key State Preservation (Direct) ===")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            # Navigate to editor
            print("Loading http://localhost:8080...")
            await page.goto("http://localhost:8080", wait_until="load", timeout=30000)

            # Wait for WASM initialization
            print("Waiting for WASM initialization...")
            await page.wait_for_function(
                "window.musicEditor && window.musicEditor.isInitialized",
                timeout=15000
            )
            print("✓ WASM initialized")

            # Focus editor
            print("Focusing editor...")
            await page.click("#notation-editor")
            await page.wait_for_timeout(500)

            # Type "1"
            print("Typing '1'...")
            await page.keyboard.type("1")
            await page.wait_for_timeout(500)

            # Verify initial state
            print("Checking initial state...")
            initial = await page.evaluate("""() => {
                const doc = window.musicEditor.theDocument;
                return {
                    has_state: !!doc.state,
                    has_cursor: !!doc.state?.cursor,
                    lines: doc.lines.length
                };
            }""")

            assert initial['has_state'], "Initial state should exist"
            assert initial['has_cursor'], "Initial cursor should exist"
            assert initial['lines'] == 1, "Should have 1 line initially"
            print(f"✓ Initial state: {initial}")

            # Press Return
            print("🔄 Pressing Return key...")
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(1000)

            # Check if state.cursor still exists (the bug was it didn't)
            print("Checking state after Return...")
            result = await page.evaluate("""() => {
                const doc = window.musicEditor.theDocument;

                if (!doc.state) {
                    return {
                        success: false,
                        error: 'state is undefined'
                    };
                }

                if (!doc.state.cursor) {
                    return {
                        success: false,
                        error: 'state.cursor is undefined'
                    };
                }

                return {
                    success: true,
                    lines: doc.lines.length,
                    cursor_stave: doc.state.cursor.stave,
                    cursor_column: doc.state.cursor.column
                };
            }""")

            print(f"Result: {result}")

            # Main assertion - state.cursor must exist
            assert result['success'], f"Fix failed: {result.get('error')}"
            assert result['lines'] == 2, f"Should have 2 lines, got {result['lines']}"
            assert result['cursor_stave'] == 1, f"Cursor should be on stave 1"
            assert result['cursor_column'] == 0, f"Cursor should be at column 0"

            print("✅ TEST PASSED - Return key state preservation works!")
            print(f"   Lines split: {result['lines']}")
            print(f"   Cursor position: stave {result['cursor_stave']}, column {result['cursor_column']}")

        finally:
            await context.close()
            await browser.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
