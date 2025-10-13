"""
Test for Cursor Line Positioning Bug

This test verifies that the cursor correctly positions itself on the correct line
when clicking or navigating between different content lanes.
"""

import pytest
import asyncio
from playwright.async_api import async_playwright, Page
from typing import Dict, List


class TestCursorLinePositioning:
    """Test that cursor positioning works correctly on different lines."""

    async def setup_method(self, page: Page):
        """Setup method for each test."""
        # Navigate to the editor
        await page.goto("http://localhost:8080")

        # Wait for the notation canvas to be available
        await page.wait_for_selector("#notation-canvas", state="visible")

        # Wait for the page to fully load
        await page.wait_for_load_state("networkidle")

        # Check if MusicNotationApp is available
        window_info = await page.evaluate("""
        () => {
            return {
                musicNotationApp: typeof window.MusicNotationApp,
                musicNotationAppExists: !!window.MusicNotationApp,
                appFunction: typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app ? typeof window.MusicNotationApp.app : 'N/A',
                appInstance: typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app ? !!window.MusicNotationApp.app() : false,
                editorExists: typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app && window.MusicNotationApp.app() ? !!window.MusicNotationApp.app().editor : false,
                documentExists: typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app && window.MusicNotationApp.app() && window.MusicNotationApp.app().editor ? !!window.MusicNotationApp.app().editor.document : false,
                allWindowProperties: Object.keys(window)
            };
        }
        """)

        print(f"Window state: {window_info}")

        # Wait for the editor to be ready
        await page.wait_for_timeout(5000)

        # Focus the editor
        await page.click("#notation-canvas")
        await page.wait_for_timeout(100)

    @pytest.mark.asyncio
    async def test_cursor_positions_on_main_line_only(self):
        """Test that cursor only appears on the main line (lane 1) regardless of content."""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Clear any existing content
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
                await page.wait_for_timeout(200)

                # Type multiple characters on the main line
                await page.keyboard.type("123")
                await page.wait_for_timeout(200)

                # Check cursor position and visual position
                cursor_info = await page.evaluate("""
                () => {
                    const app = window.MusicNotationApp.app();
                    if (!app || !app.editor) return { error: 'App not available' };

                    const editor = app.editor;
                    const cursorPos = editor.getCursorPosition();
                    const cursorLane = editor.getCurrentLane();

                    // Test getCurrentLane() method directly
                    const laneMethodCall = editor.getCurrentLane();

                    // Test internal cursor state
                    const internalCursor = editor.document.state.cursor;

                    // Get cursor visual position
                    const cursorElement = document.querySelector('.cursor-indicator');
                    if (!cursorElement) return { error: 'Cursor element not found' };

                    const cursorStyle = window.getComputedStyle(cursorElement);

                    // Get DOM structure info
                    const canvas = document.querySelector('#notation-canvas');
                    const lineElement = document.querySelector('[data-line="0"]');
                    const laneContainer = document.querySelector('[data-lane="1"]');

                    const canvasRect = canvas ? canvas.getBoundingClientRect() : null;
                    const lineRect = lineElement ? lineElement.getBoundingClientRect() : null;
                    const laneRect = laneContainer ? laneContainer.getBoundingClientRect() : null;

                    return {
                        logicalColumn: cursorPos,
                        logicalLane: cursorLane,
                        laneMethodCall: laneMethodCall,
                        internalCursor: internalCursor,
                        visualLeft: parseInt(cursorStyle.left) || 0,
                        visualTop: parseInt(cursorStyle.top) || 0,
                        visualHeight: parseInt(cursorStyle.height) || 0,
                        visualWidth: parseInt(cursorStyle.width) || 0,
                        cursorExists: !!cursorElement,
                        cursorVisible: cursorStyle.display !== 'none',
                        // Debug positioning info
                        debug: {
                            canvasRect: canvasRect ? {
                                left: canvasRect.left,
                                top: canvasRect.top,
                                width: canvasRect.width,
                                height: canvasRect.height
                            } : null,
                            lineRect: lineRect ? {
                                left: lineRect.left,
                                top: lineRect.top,
                                width: lineRect.width,
                                height: lineRect.height
                            } : null,
                            laneRect: laneRect ? {
                                left: laneRect.left,
                                top: laneRect.top,
                                width: laneRect.width,
                                height: laneRect.height
                            } : null,
                            cursorRect: cursorElement ? {
                                left: cursorElement.offsetLeft,
                                top: cursorElement.offsetTop,
                                width: cursorElement.offsetWidth,
                                height: cursorElement.offsetHeight
                            } : null
                        }
                    };
                }
                """)

                print(f"\n=== Cursor Positioning Test ===")
                print(f"Logical position: column={cursor_info['logicalColumn']}, lane={cursor_info['logicalLane']}")
                print(f"Lane method call: {cursor_info['laneMethodCall']}")
                print(f"Internal cursor state: {cursor_info['internalCursor']}")
                print(f"Visual position: left={cursor_info['visualLeft']}px, top={cursor_info['visualTop']}px")
                print(f"Cursor exists: {cursor_info['cursorExists']}")
                print(f"Cursor visible: {cursor_info['cursorVisible']}")
                print(f"Cursor size: {cursor_info['visualWidth']}x{cursor_info['visualHeight']}")

                # Print debug info
                if 'debug' in cursor_info:
                    debug = cursor_info['debug']
                    print(f"\n=== Debug Positioning Info ===")
                    print(f"Canvas rect: {debug['canvasRect']}")
                    print(f"Line rect: {debug['lineRect']}")
                    print(f"Lane rect: {debug['laneRect']}")
                    print(f"Cursor rect: {debug['cursorRect']}")

                # Verify cursor is on lane 1 (main line)
                assert cursor_info['logicalLane'] == 1, "Cursor should always be on lane 1 (main line)"

                # Verify cursor is visually positioned at the correct Y position for lane 1
                # Lane 1 should be at 16px (1 * 16px per lane)
                expected_y = 16  # lane 1 * 16px
                assert cursor_info['visualTop'] == expected_y, \
                    f"Cursor should be at y={expected_y}px for lane 1, got {cursor_info['visualTop']}px"

                # Verify cursor is positioned at the correct X position for the current column
                # After typing "123", cursor should be at position 3 (end of text)
                expected_x = 3 * 12  # 3 characters * 12px each
                assert cursor_info['visualLeft'] == expected_x, \
                    f"Cursor should be at x={expected_x}px for position 3, got {cursor_info['visualLeft']}px"

                # Verify cursor dimensions
                assert cursor_info['visualHeight'] == 16, \
                    f"Cursor height should be 16px, got {cursor_info['visualHeight']}px"
                assert cursor_info['visualWidth'] == 2, \
                    f"Cursor width should be 2px, got {cursor_info['visualWidth']}px"

                # Navigate left and check cursor position
                await page.keyboard.press("ArrowLeft")
                await page.wait_for_timeout(100)

                cursor_info_after = await page.evaluate("""
                () => {
                    const app = window.MusicNotationApp.app();
                    const editor = app.editor;
                    const cursorPos = editor.getCursorPosition();
                    const cursorLane = editor.getCurrentLane();

                    const cursorElement = document.querySelector('.cursor-indicator');
                    const cursorStyle = window.getComputedStyle(cursorElement);

                    return {
                        logicalColumn: cursorPos,
                        logicalLane: cursorLane,
                        visualLeft: parseInt(cursorStyle.left) || 0,
                        visualTop: parseInt(cursorStyle.top) || 0
                    };
                }
                """)

                print(f"After ArrowLeft: column={cursor_info_after['logicalColumn']}, lane={cursor_info_after['logicalLane']}")
                print(f"After ArrowLeft: x={cursor_info_after['visualLeft']}px, y={cursor_info_after['visualTop']}px")

                # Cursor should have moved to position 2
                assert cursor_info_after['logicalColumn'] == 2, \
                    f"Cursor should be at position 2 after left arrow, got {cursor_info_after['logicalColumn']}"

                # Cursor should still be on lane 1
                assert cursor_info_after['logicalLane'] == 1, \
                    f"Cursor should still be on lane 1 after navigation, got {cursor_info_after['logicalLane']}"

                # Cursor should still be on the correct Y position for lane 1
                assert cursor_info_after['visualTop'] == expected_y, \
                    f"Cursor should remain at y={expected_y}px for lane 1, got {cursor_info_after['visualTop']}px"

                # Cursor should have moved left by one character width
                expected_x_after = 2 * 12  # 2 characters * 12px each
                assert cursor_info_after['visualLeft'] == expected_x_after, \
                    f"Cursor should be at x={expected_x_after}px after left arrow, got {cursor_info_after['visualLeft']}px"

                print(f"\n✓ Cursor positioning test passed")
                print(f"✓ Cursor correctly positioned on main line (lane 1) with proper visual alignment")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_cursor_ignores_clicks_on_other_lanes(self):
        """Test that clicking on non-main lanes doesn't move cursor away from main line."""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Clear and add content to have some text to click near
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
                await page.wait_for_timeout(200)
                await page.keyboard.type("123")
                await page.wait_for_timeout(200)

                # Get initial cursor position
                initial_cursor = await page.evaluate("""
                () => {
                    const app = window.MusicNotationApp.app();
                    return {
                        column: app.editor.getCursorPosition(),
                        lane: app.editor.getCurrentLane()
                    };
                }
                """)

                print(f"Initial cursor position: column={initial_cursor['column']}, lane={initial_cursor['lane']}")

                # Try to click on different Y positions (other lanes)
                # These clicks should be ignored and cursor should stay on main line
                test_positions = [
                    {"x": 50, "y": 8, "description": "upper_line area"},
                    {"x": 50, "y": 24, "description": "lower_line area"},
                    {"x": 50, "y": 40, "description": "lyrics area"},
                    {"x": 50, "y": 4, "description": "between upper_line and main line"},
                    {"x": 50, "y": 20, "description": "between main line and lower_line"}
                ]

                for pos in test_positions:
                    print(f"\nTesting click at {pos['description']} (x={pos['x']}, y={pos['y']})")

                    # Click on the test position
                    await page.mouse.click(pos['x'], pos['y'])
                    await page.wait_for_timeout(100)

                    # Check cursor position after click
                    cursor_after_click = await page.evaluate("""
                    () => {
                        const app = window.MusicNotationApp.app();
                        return {
                            column: app.editor.getCursorPosition(),
                            lane: app.editor.getCurrentLane()
                        };
                    }
                    """)

                    print(f"  Cursor after click: column={cursor_after_click['column']}, lane={cursor_after_click['lane']}")

                    # Cursor should NOT have moved from main line
                    assert cursor_after_click['lane'] == 1, \
                        f"Click on {pos['description']} should not move cursor from lane 1, got lane {cursor_after_click['lane']}"

                    # Column position might change if click is near text, but lane should always stay 1
                    # This is expected behavior as mentioned in comments
                    print(f"  ✓ Cursor correctly stayed on main line")

                print(f"\n✓ Cursor ignores non-main line clicks test passed")
                print(f"✓ Cursor remains on main line (lane 1) when clicking other areas")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_cursor_keyboard_navigation_stays_on_main_line(self):
        """Test that arrow up/down doesn't move cursor away from main line."""
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Add some content
                await page.keyboard.type("123")
                await page.wait_for_timeout(200)

                # Get initial cursor state
                initial_cursor = await page.evaluate("""
                () => {
                    const app = window.MusicNotationApp.app();
                    return {
                        column: app.editor.getCursorPosition(),
                        lane: app.editor.getCurrentLane()
                    };
                }
                """)

                print(f"Initial cursor: column={initial_cursor['column']}, lane={initial_cursor['lane']}")

                # Test arrow up
                print(f"\nTesting Arrow Up navigation...")
                await page.keyboard.press("ArrowUp")
                await page.wait_for_timeout(100)

                cursor_after_up = await page.evaluate("""
                () => {
                    const app = window.MusicNotationApp.app();
                    return {
                        column: app.editor.getCursorPosition(),
                        lane: app.editor.getCurrentLane()
                    };
                }
                """)

                print(f"After Arrow Up: column={cursor_after_up['column']}, lane={cursor_after_up['lane']}")
                assert cursor_after_up['lane'] == 1, "Arrow up should not move cursor from main line"

                # Test arrow down
                print(f"Testing Arrow Down navigation...")
                await page.keyboard.press("ArrowDown")
                await page.wait_for_timeout(100)

                cursor_after_down = await page.evaluate("""
                () => {
                    const app = window.MusicNotationApp.app();
                    return {
                        column: app.editor.getCursorPosition(),
                        lane: app.editor.getCurrentLane()
                    };
                }
                """)

                print(f"After Arrow Down: column={cursor_after_down['column']}, lane={cursor_after_down['lane']}")
                assert cursor_after_down['lane'] == 1, "Arrow down should not move cursor from main line"

                # Verify cursor position is unchanged for up/down arrows
                assert cursor_after_up['column'] == cursor_after_down['column'], \
                    "Cursor position should be unchanged for up/down arrows"

                print(f"\n✓ Cursor keyboard navigation test passed")
                print(f"✅ Arrow up/down correctly keeps cursor on main line")

            finally:
                await browser.close()


if __name__ == "__main__":
    # Run the test directly
    import sys

    pytest_args = [
        __file__,
        "-v",
        "--tb=short",
        "-m", "asyncio",
        "--browser=chromium",
        "--headless"
    ]

    sys.exit(pytest.main(pytest_args))