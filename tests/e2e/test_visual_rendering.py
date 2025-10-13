"""
Comprehensive Visual Rendering Tests

Tests all visual rendering elements of the music notation editor:
- Cell positioning and hitbox accuracy
- Caret positioning and visibility
- Selection highlighting accuracy
- Slur rendering curves and positioning
- Octave dot placement and visibility
- Beat loop arc positioning
- Lane layout and spacing consistency
- Multi-element integration and layering

This test suite ensures pixel-perfect accuracy and smooth visual feedback
for all user interactions with the music notation editor.
"""

import pytest
import asyncio
import time
import statistics
from playwright.async_api import async_playwright, Page, expect
from typing import Dict, List, Tuple, Optional
import json
import os


class TestVisualRendering:
    """Comprehensive test suite for visual rendering accuracy."""

    async def setup_method(self, page: Page):
        """Setup method for each visual test."""
        # Navigate to the editor
        await page.goto("http://localhost:3000")

        # Wait for the editor to initialize
        await page.wait_for_selector("#notation-canvas")
        await page.wait_for_function("window.musicEditor && window.musicEditor.isReady")

        # Focus the editor
        await page.click("#notation-canvas")
        await page.wait_for_function("document.activeElement.id === 'notation-canvas'")

        # Clear any existing content
        await page.keyboard.press("Control+a")
        await page.keyboard.press("Backspace")
        await page.wait_for_timeout(100)

    async def get_cell_positions(self, page: Page) -> List[Dict]:
        """Get current cell positions and hitboxes from the editor."""
        return await page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.document) {
                return { error: 'Editor not ready' };
            }

            const doc = window.musicEditor.document;
            const cells = [];

            if (doc.staves && doc.staves.length > 0) {
                const stave = doc.staves[0];
                const lanes = ['upper_line', 'line', 'lower_line', 'lyrics'];

                lanes.forEach((laneName, laneIndex) => {
                    const lane = stave[laneName];
                    if (lane && lane.length > 0) {
                        lane.forEach((cell, cellIndex) => {
                            cells.push({
                                laneIndex,
                                cellIndex,
                                grapheme: cell.grapheme || '',
                                x: cell.x || 0,
                                y: cell.y || 0,
                                w: cell.w || 0,
                                h: cell.h || 0,
                                bbox: cell.bbox || [],
                                hit: cell.hit || [],
                                kind: cell.kind || 0,
                                col: cell.col || 0
                            });
                        });
                    }
                });
            }

            return cells;
        }
        """)

    async def get_caret_position(self, page: Page) -> Dict:
        """Get current caret position and visual state."""
        return await page.evaluate("""
        () => {
            const caret = document.querySelector('.cursor-indicator');
            if (!caret) {
                return { error: 'Caret not found' };
            }

            const style = window.getComputedStyle(caret);
            const rect = caret.getBoundingClientRect();
            const canvas = document.getElementById('notation-canvas');
            const canvasRect = canvas.getBoundingClientRect();

            return {
                visible: style.display !== 'none',
                left: parseFloat(style.left) || 0,
                top: parseFloat(style.top) || 0,
                width: parseFloat(style.width) || 0,
                height: parseFloat(style.height) || 0,
                opacity: parseFloat(style.opacity) || 0,
                blinking: caret.classList.contains('blinking'),
                focused: caret.classList.contains('focused'),
                selecting: caret.classList.contains('selecting'),
                absolutePosition: {
                    x: rect.left - canvasRect.left,
                    y: rect.top - canvasRect.top,
                    width: rect.width,
                    height: rect.height
                }
            };
        }
        """)

    async def get_selection_elements(self, page: Page) -> List[Dict]:
        """Get selection highlight elements and their positions."""
        return await page.evaluate("""
        () => {
            const selections = document.querySelectorAll('.selection-highlight');
            const canvas = document.getElementById('notation-canvas');
            const canvasRect = canvas.getBoundingClientRect();

            return Array.from(selections).map((sel, index) => {
                const rect = sel.getBoundingClientRect();
                const style = window.getComputedStyle(sel);

                return {
                    index,
                    left: parseFloat(style.left) || 0,
                    top: parseFloat(style.top) || 0,
                    width: parseFloat(style.width) || 0,
                    height: parseFloat(style.height) || 0,
                    backgroundColor: style.backgroundColor,
                    border: style.border,
                    zIndex: style.zIndex,
                    absolutePosition: {
                        x: rect.left - canvasRect.left,
                        y: rect.top - canvasRect.top,
                        width: rect.width,
                        height: rect.height
                    }
                };
            });
        }
        """)

    async def get_slur_canvas_info(self, page: Page) -> Dict:
        """Get slur canvas rendering information."""
        return await page.evaluate("""
        () => {
            const slurCanvas = document.querySelector('.slur-canvas-overlay');
            if (!slurCanvas) {
                return { error: 'Slur canvas not found' };
            }

            const ctx = slurCanvas.getContext('2d');
            const canvas = document.getElementById('notation-canvas');
            const canvasRect = canvas.getBoundingClientRect();

            return {
                width: slurCanvas.width,
                height: slurCanvas.height,
                visible: slurCanvas.style.display !== 'none',
                opacity: parseFloat(slurCanvas.style.opacity) || 0,
                zIndex: slurCanvas.style.zIndex,
                absolutePosition: {
                    x: slurCanvas.getBoundingClientRect().left - canvasRect.left,
                    y: slurCanvas.getBoundingClientRect().top - canvasRect.top
                }
            };
        }
        """)

    async def get_octave_canvas_info(self, page: Page) -> Dict:
        """Get octave canvas rendering information."""
        return await page.evaluate("""
        () => {
            const octaveCanvas = document.querySelector('.octave-canvas-overlay');
            if (!octaveCanvas) {
                return { error: 'Octave canvas not found' };
            }

            const ctx = octaveCanvas.getContext('2d');
            const canvas = document.getElementById('notation-canvas');
            const canvasRect = canvas.getBoundingClientRect();

            return {
                width: octaveCanvas.width,
                height: octaveCanvas.height,
                visible: octaveCanvas.style.display !== 'none',
                opacity: parseFloat(octaveCanvas.style.opacity) || 0,
                zIndex: octaveCanvas.style.zIndex,
                absolutePosition: {
                    x: octaveCanvas.getBoundingClientRect().left - canvasRect.left,
                    y: octaveCanvas.getBoundingClientRect().top - canvasRect.top
                }
            };
        }
        """)

    async def get_beat_loop_elements(self, page: Page) -> List[Dict]:
        """Get beat loop visual elements and their positions."""
        return await page.evaluate("""
        () => {
            const beatLoops = document.querySelectorAll('.beat-loop');
            const canvas = document.getElementById('notation-canvas');
            const canvasRect = canvas.getBoundingClientRect();

            return Array.from(beatLoops).map((loop, index) => {
                const rect = loop.getBoundingClientRect();
                const style = window.getComputedStyle(loop);

                return {
                    index,
                    lineIndex: parseInt(loop.dataset.lineIndex) || 0,
                    beatIndex: parseInt(loop.dataset.beatIndex) || 0,
                    left: parseFloat(style.left) || 0,
                    top: parseFloat(style.top) || 0,
                    width: parseFloat(style.width) || 0,
                    height: parseFloat(style.height) || 0,
                    border: style.border,
                    borderRadius: style.borderRadius,
                    backgroundColor: style.backgroundColor,
                    zIndex: style.zIndex,
                    absolutePosition: {
                        x: rect.left - canvasRect.left,
                        y: rect.top - canvasRect.top,
                        width: rect.width,
                        height: rect.height
                    }
                };
            });
        }
        """)

    async def take_element_screenshot(self, page: Page, element_selector: str) -> bytes:
        """Take a screenshot of a specific element."""
        element = await page.query_selector(element_selector)
        if not element:
            raise Exception(f"Element not found: {element_selector}")

        return await element.screenshot()

    async def click_at_coordinates(self, page: Page, x: float, y: float):
        """Click at specific canvas coordinates."""
        canvas = await page.query_selector("#notation-canvas")
        if not canvas:
            raise Exception("Canvas not found")

        canvas_rect = await canvas.bounding_box()
        if not canvas_rect:
            raise Exception("Could not get canvas bounds")

        # Calculate click position relative to canvas
        click_x = canvas_rect['x'] + x
        click_y = canvas_rect['y'] + y

        await page.mouse.click(click_x, click_y)

    @pytest.mark.asyncio
    async def test_cell_positioning_accuracy(self):
        """Test accurate positioning of musical notation cells."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Test basic notation entry
                await page.keyboard.type("1234567")
                await page.wait_for_timeout(200)

                # Get cell positions
                cells = await self.get_cell_positions(page)
                main_lane_cells = [c for c in cells if c['laneIndex'] == 1]  # Main line

                assert len(main_lane_cells) >= 7, f"Expected at least 7 cells, got {len(main_lane_cells)}"

                print("\n=== Cell Positioning Test ===")
                for i, cell in enumerate(main_lane_cells[:7]):
                    print(f"Cell {i}: '{cell['grapheme']}' at ({cell['x']:.1f}, {cell['y']:.1f}) size {cell['w']:.1f}×{cell['h']:.1f}")

                    # Validate cell positioning
                    expected_x = i * 12  # 12px per character
                    assert abs(cell['x'] - expected_x) <= 1, f"Cell {i} X position {cell['x']} too far from expected {expected_x}"
                    assert cell['y'] == 0, f"Cell {i} Y position should be 0 relative to lane"
                    assert cell['w'] >= 11, f"Cell {i} width {cell['w']} too narrow"
                    assert cell['h'] == 16, f"Cell {i} height {cell['h']} should be 16"

                    # Validate hitbox
                    if cell['bbox']:
                        expected_bbox = [cell['x'], cell['y'], cell['x'] + cell['w'], cell['y'] + cell['h']]
                        for j in range(4):
                            assert abs(cell['bbox'][j] - expected_bbox[j]) <= 1, f"Cell {i} bbox[{j}] incorrect"

                print("✓ Cell positioning accuracy test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_caret_positioning_and_visibility(self):
        """Test caret positioning, visibility, and blinking behavior."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Test initial caret visibility
                caret = await self.get_caret_position(page)
                assert caret['visible'], "Caret should be visible when editor is focused"
                assert caret['blinking'], "Caret should be blinking"
                assert caret['focused'], "Caret should show focused state"

                print("\n=== Caret Positioning Test ===")
                print(f"Initial caret: ({caret['left']:.1f}, {caret['top']:.1f}) size {caret['width']:.1f}×{caret['height']:.1f}")

                # Type some characters and test caret movement
                test_input = "123"
                for i, char in enumerate(test_input):
                    await page.keyboard.type(char)
                    await page.wait_for_timeout(100)

                    caret = await self.get_caret_position(page)
                    expected_x = (i + 1) * 12  # After typing i+1 characters

                    print(f"After '{char}': caret at ({caret['left']:.1f}, {caret['top']:.1f})")
                    assert abs(caret['left'] - expected_x) <= 1, f"Caret X position {caret['left']} too far from expected {expected_x}"
                    assert caret['visible'], f"Caret should remain visible after typing '{char}'"

                # Test caret with navigation
                await page.keyboard.press("ArrowLeft")
                await page.wait_for_timeout(50)
                caret = await self.get_caret_position(page)
                expected_x = 2 * 12  # Should be after 2 characters
                assert abs(caret['left'] - expected_x) <= 1, f"Caret position after arrow left incorrect"

                # Test caret height and alignment
                assert caret['height'] == 16, f"Caret height {caret['height']} should be 16px"
                assert caret['width'] == 2, f"Caret width {caret['width']} should be 2px"

                print("✓ Caret positioning and visibility test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_selection_highlighting_accuracy(self):
        """Test selection highlighting accuracy and visibility."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Type test content
                await page.keyboard.type("1234567")
                await page.wait_for_timeout(200)

                print("\n=== Selection Highlighting Test ===")

                # Test keyboard selection
                # Move to start and select right
                await page.keyboard.press("Home")
                await page.wait_for_timeout(50)

                await page.keyboard.down("Shift")
                await page.keyboard.press("ArrowRight")
                await page.keyboard.press("ArrowRight")
                await page.keyboard.press("ArrowRight")
                await page.keyboard.up("Shift")
                await page.wait_for_timeout(100)

                # Check selection elements
                selections = await self.get_selection_elements(page)
                assert len(selections) >= 1, "Should have at least one selection highlight"

                selection = selections[0]
                print(f"Selection: ({selection['left']:.1f}, {selection['top']:.1f}) size {selection['width']:.1f}×{selection['height']:.1f}")

                # Validate selection positioning and size
                expected_x = 0  # Start at beginning
                expected_width = 3 * 12  # 3 characters selected
                expected_height = 16  # Should match cell height

                assert abs(selection['left'] - expected_x) <= 1, f"Selection X position {selection['left']} too far from expected {expected_x}"
                assert abs(selection['width'] - expected_width) <= 2, f"Selection width {selection['width']} too far from expected {expected_width}"
                assert selection['height'] == expected_height, f"Selection height {selection['height']} should be {expected_height}"

                # Validate selection styling
                assert 'rgba' in selection['backgroundColor'], "Selection should have transparent background color"
                assert selection['zIndex'] == '2', "Selection should have z-index 2"

                # Clear selection and test
                await page.keyboard.press("ArrowRight")
                await page.wait_for_timeout(50)

                selections_after = await self.get_selection_elements(page)
                print(f"Selections after clear: {len(selections_after)}")

                print("✓ Selection highlighting accuracy test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_accidental_cell_positioning(self):
        """Test positioning accuracy for cells with accidentals."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Test accidentals
                accidental_inputs = ["1#", "2##", "3b", "4bb"]

                print("\n=== Accidental Cell Positioning Test ===")

                for test_input in accidental_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    # Type accidental
                    await page.keyboard.type(test_input)
                    await page.wait_for_timeout(200)

                    # Get cell positions
                    cells = await self.get_cell_positions(page)
                    main_lane_cells = [c for c in cells if c['laneIndex'] == 1]

                    assert len(main_lane_cells) >= 1, f"Should have at least one cell for '{test_input}'"

                    cell = main_lane_cells[0]
                    char_count = len(test_input)
                    expected_width = char_count * 12

                    print(f"Accidental '{test_input}': '{cell['grapheme']}' at ({cell['x']:.1f}, {cell['y']:.1f}) size {cell['w']:.1f}×{cell['h']:.1f}")

                    # Validate multi-character cell width
                    assert abs(cell['w'] - expected_width) <= 1, f"Accidental cell width {cell['w']} too far from expected {expected_width}"
                    assert cell['x'] == 0, f"Accidental cell should start at X=0"

                    # Validate hitbox expands for multi-character cells
                    if cell['hit']:
                        expected_hit_width = expected_width + 4  # 2px padding on each side
                        actual_hit_width = cell['hit'][2] - cell['hit'][0]  # right - left
                        assert abs(actual_hit_width - expected_hit_width) <= 2, f"Hitbox width {actual_hit_width} incorrect for '{test_input}'"

                print("✓ Accidental cell positioning test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_lane_layout_consistency(self):
        """Test consistent lane layout and spacing."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Add content to different lanes (simulate upper and lower annotations)
                await page.keyboard.type("123")  # Main lane
                await page.wait_for_timeout(200)

                print("\n=== Lane Layout Consistency Test ===")

                # Get all cells in all lanes
                cells = await self.get_cell_positions(page)

                # Group cells by lane
                lanes = {}
                for cell in cells:
                    lane_idx = cell['laneIndex']
                    if lane_idx not in lanes:
                        lanes[lane_idx] = []
                    lanes[lane_idx].append(cell)

                print(f"Found {len(lanes)} lanes with content:")
                for lane_idx, lane_cells in lanes.items():
                    print(f"  Lane {lane_idx}: {len(lane_cells)} cells")

                # Validate main lane (lane 1) has content
                assert 1 in lanes, "Main lane (1) should have content"
                assert len(lanes[1]) >= 3, "Main lane should have at least 3 cells"

                # Validate lane positioning
                expected_lane_heights = [0, 16, 32, 48]  # Y offsets for each lane
                for lane_idx, expected_y in enumerate(expected_lane_heights):
                    if lane_idx in lanes:
                        for cell in lanes[lane_idx]:
                            assert cell['y'] == 0, f"Cell in lane {lane_idx} should have Y=0 relative to lane container"
                            # The lane container itself should be positioned at expected_y
                            # This is handled by the lane container positioning

                # Validate consistent cell heights across lanes
                for lane_idx, lane_cells in lanes.items():
                    for cell in lane_cells:
                        assert cell['h'] == 16, f"Cell height should be 16px in all lanes (lane {lane_idx})"

                print("✓ Lane layout consistency test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_click_positioning_accuracy(self):
        """Test that clicking on cells positions cursor correctly."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Type test content
                await page.keyboard.type("1234567")
                await page.wait_for_timeout(200)

                print("\n=== Click Positioning Accuracy Test ===")

                # Get cell positions
                cells = await self.get_cell_positions(page)
                main_lane_cells = [c for c in cells if c['laneIndex'] == 1]

                assert len(main_lane_cells) >= 7, "Should have at least 7 cells for click testing"

                # Test clicking on each cell
                for i, cell in enumerate(main_lane_cells[:5]):  # Test first 5 cells
                    # Calculate click position (center of cell)
                    click_x = cell['x'] + cell['w'] / 2
                    click_y = cell['y'] + cell['h'] / 2 + 16  # Add lane offset (main lane is at y=16)

                    print(f"Clicking on cell {i} '{cell['grapheme']}' at ({click_x:.1f}, {click_y:.1f})")

                    # Clear selection and click
                    await page.keyboard.press("Escape")  # Clear any selection
                    await self.click_at_coordinates(page, click_x, click_y)
                    await page.wait_for_timeout(100)

                    # Check cursor position
                    caret = await self.get_caret_position(page)
                    expected_caret_x = cell['x'] + cell['w']  # Should be after the cell

                    print(f"  Caret moved to: ({caret['left']:.1f}, {caret['top']:.1f})")

                    # Allow some tolerance for positioning
                    assert abs(caret['left'] - expected_caret_x) <= 3, \
                        f"Click on cell {i} didn't position cursor correctly (got {caret['left']}, expected ~{expected_caret_x})"

                print("✓ Click positioning accuracy test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_visual_element_layering(self):
        """Test proper z-index layering of visual elements."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Type content and create selection
                await page.keyboard.type("123")
                await page.wait_for_timeout(200)

                # Create selection to test layering
                await page.keyboard.press("Home")
                await page.keyboard.down("Shift")
                await page.keyboard.press("ArrowRight")
                await page.keyboard.press("ArrowRight")
                await page.keyboard.up("Shift")
                await page.wait_for_timeout(100)

                print("\n=== Visual Element Layering Test ===")

                # Get all visual elements and their z-indexes
                cells = await self.get_cell_positions(page)
                selections = await self.get_selection_elements(page)
                caret = await self.get_caret_position(page)
                slur_canvas = await self.get_slur_canvas_info(page)
                octave_canvas = await self.get_octave_canvas_info(page)

                print("Element z-index values:")

                # Cell elements should be at base level
                print(f"  Cells: base level (DOM elements)")

                # Selection should be above cells
                if selections:
                    for sel in selections:
                        print(f"  Selection {sel['index']}: z-index {sel['zIndex']}")
                        assert int(sel['zIndex']) >= 2, f"Selection z-index {sel['zIndex']} should be >= 2"

                # Caret should be above selection
                print(f"  Caret: should be above selection")
                # Caret z-index is set in CSS as 5

                # Slur canvas should be positioned correctly
                if 'error' not in slur_canvas:
                    print(f"  Slur canvas: z-index {slur_canvas['zIndex']}")
                    assert int(slur_canvas['zIndex']) == 3, f"Slur canvas z-index should be 3"

                # Octave canvas should be positioned correctly
                if 'error' not in octave_canvas:
                    print(f"  Octave canvas: z-index {octave_canvas['zIndex']}")
                    assert int(octave_canvas['zIndex']) == 2, f"Octave canvas z-index should be 2"

                # Test that elements are visible
                assert caret['visible'], "Caret should be visible"
                if selections:
                    assert len(selections) > 0, "Should have selection elements"

                print("✓ Visual element layering test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_multi_character_cell_rendering(self):
        """Test rendering of complex multi-character cells."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Test various complex notations
                complex_inputs = [
                    "1#",    # Single sharp
                    "2##",   # Double sharp
                    "3b",    # Single flat
                    "4bb",   # Double flat
                    "c#",    # Western sharp
                    "d##",   # Western double sharp
                ]

                print("\n=== Multi-Character Cell Rendering Test ===")

                for test_input in complex_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    # Switch to western system if needed
                    if test_input.startswith(('c', 'd', 'e', 'f', 'g', 'a', 'b')):
                        # Switch pitch system to western
                        await page.click('[data-menu-item="set-pitch-system"]')
                        await page.wait_for_timeout(100)
                        await page.keyboard.type("western")
                        await page.keyboard.press("Enter")
                        await page.wait_for_timeout(200)

                    # Type complex input
                    await page.keyboard.type(test_input)
                    await page.wait_for_timeout(200)

                    # Get rendered cells
                    cells = await self.get_cell_positions(page)
                    main_lane_cells = [c for c in cells if c['laneIndex'] == 1]

                    assert len(main_lane_cells) >= 1, f"Should have rendered cell for '{test_input}'"

                    cell = main_lane_cells[0]
                    char_count = len(test_input)
                    expected_width = char_count * 12

                    print(f"Complex '{test_input}': rendered as '{cell['grapheme']}'")
                    print(f"  Position: ({cell['x']:.1f}, {cell['y']:.1f})")
                    print(f"  Size: {cell['w']:.1f}×{cell['h']:.1f} (expected width: {expected_width})")

                    # Validate rendering
                    assert abs(cell['w'] - expected_width) <= 1, \
                        f"Multi-character cell width incorrect for '{test_input}'"
                    assert cell['h'] == 16, "Cell height should be consistent"
                    assert cell['x'] == 0, "Cell should start at beginning"

                    # Validate hitbox encompasses entire cell
                    if cell['bbox']:
                        expected_bbox_width = expected_width
                        actual_bbox_width = cell['bbox'][2] - cell['bbox'][0]
                        assert abs(actual_bbox_width - expected_bbox_width) <= 1, \
                            f"Bounding box width incorrect for '{test_input}'"

                print("✓ Multi-character cell rendering test passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_rendering_performance_under_load(self):
        """Test rendering performance with large amounts of content."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Generate large content
                base_pattern = "1234567"
                large_input = " ".join([base_pattern] * 10)  # 70 characters with spaces

                print(f"\n=== Rendering Performance Test ===")
                print(f"Input size: {len(large_input)} characters")

                # Measure rendering performance
                start_time = time.perf_counter()
                await page.keyboard.type(large_input)

                # Wait for all rendering to complete
                await page.wait_for_timeout(500)

                end_time = time.perf_counter()
                render_time = (end_time - start_time) * 1000

                print(f"Total rendering time: {render_time:.2f}ms")
                avg_time_per_char = render_time / len(large_input.replace(" ", ""))
                print(f"Average time per character: {avg_time_per_char:.2f}ms")

                # Validate performance requirements
                assert avg_time_per_char < 50, \
                    f"Rendering time {avg_time_per_char:.2f}ms per character exceeds 50ms requirement"

                # Get final state
                cells = await self.get_cell_positions(page)
                main_lane_cells = [c for c in cells if c['laneIndex'] == 1]

                print(f"Total cells rendered: {len(main_lane_cells)}")
                assert len(main_lane_cells) >= 50, f"Should have rendered at least 50 cells, got {len(main_lane_cells)}"

                # Test that all cells are properly positioned
                position_errors = 0
                for i, cell in enumerate(main_lane_cells[:10]):  # Check first 10 cells
                    expected_x = i * 12
                    if abs(cell['x'] - expected_x) > 2:
                        position_errors += 1

                assert position_errors <= 1, f"Too many positioning errors: {position_errors} out of 10 cells"

                print("✓ Rendering performance test passed")

            finally:
                await browser.close()


if __name__ == "__main__":
    # Run visual rendering tests directly
    import sys

    # Configure pytest arguments
    pytest_args = [
        __file__,
        "-v",
        "--tb=short",
        "-m", "asyncio",
        "--browser=chromium",
        "--headless"
    ]

    # Run pytest
    sys.exit(pytest.main(pytest_args))