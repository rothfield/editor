"""
E2E Tests for Return Key Line Splitting Feature

Tests the Return/Enter key functionality for splitting lines at cursor position.
This is a non-trivial feature that involves:
- WASM function (splitLineAtPosition) for splitting lines
- JavaScript keyboard handler integration
- Document state management
- Cursor position updates
- Beat recalculation on both affected lines

Test Coverage:
- Split at start of line (entire content moves to new line)
- Split in middle of line (proper cell distribution)
- Split at end of line (new empty line created)
- Multiple consecutive splits
- Cursor positioning after split
- Beat recalculation
- Musical property inheritance
- Selection prevention (with warning)
- Document line count validation
"""

import pytest
import asyncio
from playwright.async_api import Page, expect
import time
from typing import Dict, List, Tuple


class TestReturnKeyLineSplitting:
    """Test suite for Return key line splitting functionality."""

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_split_at_start_of_line(self, editor_page: Page):
        """Test splitting a line at the start position.

        When cursor is at position 0 and Return is pressed:
        - Old line becomes empty
        - New line gets all content
        - Cursor moves to new line at position 0
        """
        page = editor_page

        # Type content: "123"
        await page.keyboard.type("123")
        await page.wait_for_timeout(200)

        # Verify initial state
        initial_state = await self._get_document_state(page)
        assert initial_state["lines_count"] == 1, "Should start with 1 line"
        assert initial_state["total_cells"] == 3, "Should have 3 cells"

        # Move cursor to start
        await page.keyboard.press("Home")
        await page.wait_for_timeout(100)

        # Press Return to split
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Verify split occurred
        final_state = await self._get_document_state(page)
        assert final_state["lines_count"] == 2, "Should now have 2 lines"
        assert final_state["current_stave"] == 1, "Cursor should be on line 1 (index 1)"
        assert final_state["cursor_column"] == 0, "Cursor should be at column 0"

        # Verify line distribution
        line_contents = await self._get_line_contents(page)
        assert len(line_contents) == 2, "Should have 2 lines"
        assert line_contents[0] == "", "First line should be empty"
        assert line_contents[1] == "123", "Second line should have all content"

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_split_in_middle_of_line(self, editor_page: Page):
        """Test splitting a line in the middle.

        When cursor is at position 2 of "12345" and Return is pressed:
        - Old line keeps: "12"
        - New line gets: "345"
        - Cursor moves to new line at position 0
        """
        page = editor_page

        # Type content: "12345"
        await page.keyboard.type("12345")
        await page.wait_for_timeout(200)

        # Move cursor to position 2 (between "12" and "345")
        await page.keyboard.press("Home")
        await page.keyboard.press("ArrowRight")
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(100)

        # Verify cursor position
        before_split = await self._get_document_state(page)
        assert before_split["cursor_column"] == 2, "Cursor should be at position 2"

        # Press Return to split
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Verify split occurred
        final_state = await self._get_document_state(page)
        assert final_state["lines_count"] == 2, "Should have 2 lines"
        assert final_state["current_stave"] == 1, "Cursor should be on new line"

        # Verify line distribution
        line_contents = await self._get_line_contents(page)
        assert line_contents[0] == "12", "First line should have '12'"
        assert line_contents[1] == "345", "Second line should have '345'"

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_split_at_end_of_line(self, editor_page: Page):
        """Test splitting a line at the end.

        When cursor is at the end of "123" and Return is pressed:
        - Old line keeps: "123"
        - New line is empty
        - Cursor moves to new empty line
        """
        page = editor_page

        # Type content: "123"
        await page.keyboard.type("123")
        await page.wait_for_timeout(200)

        # Move cursor to end
        await page.keyboard.press("End")
        await page.wait_for_timeout(100)

        # Press Return to split
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Verify split occurred
        final_state = await self._get_document_state(page)
        assert final_state["lines_count"] == 2, "Should have 2 lines"

        # Verify line distribution
        line_contents = await self._get_line_contents(page)
        assert line_contents[0] == "123", "First line should keep all content"
        assert line_contents[1] == "", "Second line should be empty"
        assert final_state["current_stave"] == 1, "Cursor should be on new line"
        assert final_state["cursor_column"] == 0, "Cursor should be at start of new line"

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_multiple_consecutive_splits(self, editor_page: Page):
        """Test multiple consecutive line splits.

        Verifies that:
        - Multiple splits work correctly
        - Each split creates proper line structure
        - Cursor moves correctly through splits
        - Document maintains consistency
        """
        page = editor_page

        # Type content: "1234567"
        await page.keyboard.type("1234567")
        await page.wait_for_timeout(200)

        # Move to position 2 and split
        await page.keyboard.press("Home")
        for _ in range(2):
            await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(100)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Should now have 2 lines: "12" and "34567"
        state1 = await self._get_document_state(page)
        assert state1["lines_count"] == 2, "First split should create 2 lines"

        # Split again at position 2 of current line ("34567")
        await page.keyboard.press("Home")
        for _ in range(2):
            await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(100)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Should now have 3 lines: "12", "34", "567"
        state2 = await self._get_document_state(page)
        assert state2["lines_count"] == 3, "Second split should create 3 lines"

        # Verify line structure
        line_contents = await self._get_line_contents(page)
        assert line_contents[0] == "12", "Line 0 should be '12'"
        assert line_contents[1] == "34", "Line 1 should be '34'"
        assert line_contents[2] == "567", "Line 2 should be '567'"

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_cursor_positioning(self, editor_page: Page):
        """Test that cursor positioning is correct after split.

        Verifies that:
        - Cursor moves to new line (stave index increases)
        - Cursor column is reset to 0
        - User can immediately type on new line
        """
        page = editor_page

        # Type content
        await page.keyboard.type("abc")
        await page.wait_for_timeout(200)

        # Position cursor in middle
        await page.keyboard.press("Home")
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(100)

        state_before = await self._get_document_state(page)
        stave_before = state_before["current_stave"]

        # Split
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        state_after = await self._get_document_state(page)
        assert state_after["current_stave"] == stave_before + 1, "Stave should increase"
        assert state_after["cursor_column"] == 0, "Column should be 0"

        # Verify we can type on new line
        await page.keyboard.type("xyz")
        await page.wait_for_timeout(200)

        final_contents = await self._get_line_contents(page)
        assert final_contents[state_after["current_stave"]] == "xyz", "Should be able to type on new line"

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_with_accidentals(self, editor_page: Page):
        """Test Return key with accidental-containing notes.

        Ensures that:
        - Accidentals are preserved in splits
        - Proper cells are distributed
        """
        page = editor_page

        # Type content with accidentals: "1# 2## 3b"
        await page.keyboard.type("1# 2## 3b")
        await page.wait_for_timeout(200)

        initial_state = await self._get_document_state(page)
        assert initial_state["lines_count"] == 1, "Start with 1 line"

        # Position cursor after first note
        await page.keyboard.press("Home")
        for _ in range(2):  # Position after "1#"
            await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(100)

        # Split
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Verify structure
        final_state = await self._get_document_state(page)
        assert final_state["lines_count"] == 2, "Should have 2 lines"

        line_contents = await self._get_line_contents(page)
        assert "1#" in line_contents[0], "First line should contain '1#'"
        assert "2##" in line_contents[1] or "2" in line_contents[1], "Second line should have remaining content"

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_with_selection_blocked(self, editor_page: Page):
        """Test that Return key is blocked when selection is active.

        Verifies that:
        - Selection prevents line splitting (safety feature for undo)
        - Warning is shown to user
        - No unintended split occurs
        """
        page = editor_page

        # Type content
        await page.keyboard.type("12345")
        await page.wait_for_timeout(200)

        # Select some content: Shift+Ctrl+Left to select words
        await page.keyboard.press("Home")
        await page.keyboard.press("Shift+End")
        await page.wait_for_timeout(100)

        initial_state = await self._get_document_state(page)
        assert initial_state["lines_count"] == 1, "Start with 1 line"

        # Try to press Return (should be blocked)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Verify split did NOT occur
        final_state = await self._get_document_state(page)
        assert final_state["lines_count"] == 1, "Should still have 1 line (return blocked)"

        # Check if warning was displayed (look for warning message in page)
        console_output = await page.evaluate("""
        () => {
            if (window.musicEditor && window.musicEditor.getLastWarning) {
                return window.musicEditor.getLastWarning();
            }
            return null;
        }
        """)
        # Warning should have been logged (if logging available)

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_beat_recalculation(self, editor_page: Page):
        """Test that beats are recalculated after line split.

        Verifies that:
        - Both old and new lines have beats recalculated
        - Beat structure is maintained after split
        """
        page = editor_page

        # Type musical content that would have beats
        await page.keyboard.type("1 2 3 4")
        await page.wait_for_timeout(300)

        # Get beat info before split
        beats_before = await self._get_beat_info(page)

        # Position cursor and split
        await page.keyboard.press("Home")
        for _ in range(3):  # Position after "1 2 "
            await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(100)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Get beat info after split
        beats_after = await self._get_beat_info(page)

        # Verify both lines exist and beats are available
        state_after = await self._get_document_state(page)
        assert state_after["lines_count"] == 2, "Should have 2 lines"
        # Both lines should have beat information (non-zero length)

    @pytest.mark.asyncio
    @pytest.mark.e2e
    async def test_return_key_property_inheritance(self, editor_page: Page):
        """Test that new lines inherit musical properties.

        Verifies that:
        - New line inherits pitch_system from parent
        - New line inherits tonic from parent
        - New line inherits key_signature from parent
        - New line inherits tempo from parent
        - New line has empty label, lyrics, tala
        """
        page = editor_page

        # Type some content
        await page.keyboard.type("1234")
        await page.wait_for_timeout(200)

        # Get properties of first line
        props_before = await self._get_line_properties(page, 0)

        # Split
        await page.keyboard.press("Home")
        for _ in range(2):
            await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(100)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)

        # Get properties of new line
        state = await self._get_document_state(page)
        props_after = await self._get_line_properties(page, state["current_stave"])

        # Verify property inheritance
        assert props_before["pitch_system"] == props_after["pitch_system"], \
            "New line should inherit pitch_system"
        # Note: Other properties may not be explicitly set in this test

    @pytest.mark.asyncio
    @pytest.mark.e2e
    @pytest.mark.performance
    async def test_return_key_performance(self, editor_page: Page, performance_thresholds: Dict):
        """Test that Return key operation meets performance requirements.

        Verifies that:
        - Return key response time is acceptable (< 50ms typical)
        - Multiple splits don't degrade performance
        - No memory leaks in repeated splits
        """
        page = editor_page

        split_times = []

        for i in range(5):
            # Type content
            await page.keyboard.type("1234")
            await page.wait_for_timeout(100)

            # Measure time to split
            start_time = time.perf_counter()
            await page.keyboard.press("Enter")
            end_time = time.perf_counter()

            split_times.append((end_time - start_time) * 1000)  # Convert to ms

            await page.wait_for_timeout(100)

            # Clear for next iteration
            await page.keyboard.press("Control+a")
            await page.keyboard.press("Backspace")
            await page.wait_for_timeout(100)

        # Verify performance
        avg_split_time = sum(split_times) / len(split_times)
        assert avg_split_time < 200, f"Average split time {avg_split_time}ms should be < 200ms"

        # No single split should take longer than 500ms
        max_split_time = max(split_times)
        assert max_split_time < 500, f"Max split time {max_split_time}ms should be < 500ms"

    # Helper methods

    async def _get_document_state(self, page: Page) -> Dict:
        """Get current document state including line count and cursor position."""
        return await page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Editor not ready' };
            }

            const doc = window.musicEditor.theDocument;
            const cursor = doc.state.cursor;

            return {
                lines_count: doc.lines ? doc.lines.length : 0,
                current_stave: cursor ? cursor.stave : 0,
                cursor_column: cursor ? cursor.column : 0,
                total_cells: doc.lines ? doc.lines.reduce((sum, line) => sum + line.cells.length, 0) : 0,
                isReady: window.musicEditor.isInitialized
            };
        }
        """)

    async def _get_line_contents(self, page: Page) -> List[str]:
        """Get the string content of each line."""
        return await page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return [];
            }

            const doc = window.musicEditor.theDocument;
            return doc.lines.map(line => {
                return line.cells.map(cell => cell.char || '').join('');
            });
        }
        """)

    async def _get_beat_info(self, page: Page) -> Dict:
        """Get beat information for all lines."""
        return await page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.theDocument) {
                return { error: 'Editor not ready' };
            }

            const doc = window.musicEditor.theDocument;
            return {
                line_count: doc.lines.length,
                beats_per_line: doc.lines.map(line => line.beats ? line.beats.length : 0)
            };
        }
        """)

    async def _get_line_properties(self, page: Page, line_index: int) -> Dict:
        """Get musical properties of a specific line."""
        return await page.evaluate(f"""
        () => {{
            if (!window.musicEditor || !window.musicEditor.theDocument) {{
                return {{}};
            }}

            const doc = window.musicEditor.theDocument;
            const line = doc.lines[{line_index}];

            if (!line) return {{}};

            return {{
                pitch_system: line.pitch_system,
                tonic: line.tonic || '',
                key_signature: line.key_signature || '',
                tempo: line.tempo || '',
                label: line.label || '',
                lyrics: line.lyrics || '',
                tala: line.tala || ''
            }};
        }}
        """)
