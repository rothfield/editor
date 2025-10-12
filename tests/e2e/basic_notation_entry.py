"""
E2E Tests for Basic Music Notation Entry

Tests the fundamental functionality of entering musical notation
using both Number and Western pitch systems, as defined in User Story 1.

Test Coverage:
- Basic notation entry with Number system (1-7)
- Basic notation entry with Western system (cdefgab/CDEFGAB)
- Accidental handling (#, ##, b, bb)
- Real-time Cell creation
- Document state validation
- Performance requirements for input latency
"""

import pytest
import asyncio
from playwright.async_api import async_playwright, Page, expect
import time
import json
from typing import Dict, List, Tuple


class TestBasicNotationEntry:
    """Test suite for basic music notation entry functionality."""

    async def async_setup(self, page: Page):
        """Setup method for each test."""
        # Navigate to the editor
        await page.goto("http://localhost:3000")

        # Wait for the editor to initialize
        await page.wait_for_selector("#notation-canvas")
        await page.wait_for_function("window.musicEditor && window.musicEditor.isReady")

        # Focus the editor
        await page.click("#notation-canvas")

        # Wait for focus to be established
        await page.wait_for_function("document.activeElement.id === 'notation-canvas'")

        # Clear any existing content
        await page.keyboard.press("Control+a")
        await page.keyboard.press("Backspace")

    async def measure_input_latency(self, page: Page, keystrokes: str) -> float:
        """Measure input latency for a series of keystrokes."""
        start_time = time.perf_counter()

        await page.keyboard.type(keystrokes)

        # Wait for processing to complete
        await page.wait_for_timeout(100)

        end_time = time.perf_counter()
        return (end_time - start_time) / len(keystrokes) * 1000  # Return average latency in ms

    async def get_document_state(self, page: Page) -> Dict:
        """Get the current document state from the editor."""
        return await page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.document) {
                return { error: 'Editor not ready' };
            }

            const doc = window.musicEditor.document;
            const metadata = window.musicEditor.getDocumentMetadata();

            return {
                lines: doc.lines ? doc.lines.length : 0,
                content: doc.lines ? doc.lines.map(line =>
                    line.lanes.map(lane =>
                        lane.map(cell => cell.grapheme || '').join('')
                    ).join(' | ')
                ) : [],
                metadata: metadata,
                cursor: window.musicEditor.getCursorPosition(),
                charCells: doc.lines ? doc.lines.reduce((count, line) =>
                    count + line.lanes.reduce((laneCount, lane) =>
                        laneCount + lane.length, 0
                    ), 0
                ) : 0
            };
        }
        """)

    async def get_render_stats(self, page: Page) -> Dict:
        """Get current rendering performance statistics."""
        return await page.evaluate("""
        () => {
            if (!window.musicEditor || !window.musicEditor.renderer) {
                return { error: 'Renderer not available' };
            }

            return window.musicEditor.renderer.getRenderStats();
        }
        """)

    @pytest.mark.asyncio
    async def test_number_system_basic_entry(self):
        """Test basic entry using Number system (1-7)."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Test entry: "1 2 3 4 5 6 7"
                test_input = "1234567"

                # Measure input latency
                latency = await self.measure_input_latency(page, test_input)

                # Verify performance requirement (should be under 50ms average)
                assert latency < 50, f"Input latency {latency:.2f}ms exceeds 50ms requirement"

                # Get document state
                doc_state = await self.get_document_state(page)

                # Verify document structure
                assert doc_state["lines"] == 1, f"Expected 1 line, got {doc_state['lines']}"
                assert doc_state["charCells"] == 7, f"Expected 7 Cells, got {doc_state['charCells']}"

                # Verify content contains our input
                content_text = " ".join(doc_state["content"])
                assert "1234567" in content_text, f"Input '1234567' not found in content: {content_text}"

                # Verify pitch system is still number (default)
                assert doc_state["metadata"]["pitchSystem"] == "number", \
                    f"Expected pitch system 'number', got {doc_state['metadata']['pitchSystem']}"

                print(f"✓ Number system basic entry passed (latency: {latency:.2f}ms)")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_western_system_basic_entry(self):
        """Test basic entry using Western system (cdefgab)."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Switch to Western pitch system
                await page.click('[data-menu-item="set-pitch-system"]')
                await page.wait_for_timeout(100)

                # Type "western" to select Western system
                await page.keyboard.type("western")
                await page.keyboard.press("Enter")

                # Wait for system change to take effect
                await page.wait_for_timeout(200)

                # Test entry: "c d e f g a b"
                test_input = "cdefgab"

                # Measure input latency
                latency = await self.measure_input_latency(page, test_input)

                # Verify performance requirement
                assert latency < 50, f"Input latency {latency:.2f}ms exceeds 50ms requirement"

                # Get document state
                doc_state = await self.get_document_state(page)

                # Verify document structure
                assert doc_state["lines"] == 1, f"Expected 1 line, got {doc_state['lines']}"
                assert doc_state["charCells"] == 7, f"Expected 7 Cells, got {doc_state['charCells']}"

                # Verify content contains our input (Western system converts to uppercase internally)
                content_text = " ".join(doc_state["content"]).upper()
                assert "CDEFGAB" in content_text, f"Input 'cdefgab' not found in content: {content_text}"

                # Verify pitch system changed to western
                assert doc_state["metadata"]["pitchSystem"] == "western", \
                    f"Expected pitch system 'western', got {doc_state['metadata']['pitchSystem']}"

                print(f"✓ Western system basic entry passed (latency: {latency:.2f}ms)")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_accidentals_number_system(self):
        """Test accidentals with Number system (#, ##, b, bb)."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Test accidentals: "1# 2## 3b 4bb"
                test_inputs = ["1#", "2##", "3b", "4bb"]

                for test_input in test_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")

                    # Measure input latency
                    latency = await self.measure_input_latency(page, test_input)

                    # Verify performance requirement
                    assert latency < 50, f"Input latency {latency:.2f}ms for '{test_input}' exceeds 50ms requirement"

                    # Get document state
                    doc_state = await self.get_document_state(page)

                    # Verify Cell was created for accidental
                    expected_cells = len(test_input)
                    assert doc_state["charCells"] >= expected_cells, \
                        f"Expected at least {expected_cells} Cells for '{test_input}', got {doc_state['charCells']}"

                    print(f"✓ Accidental '{test_input}' passed (latency: {latency:.2f}ms)")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_accidentals_western_system(self):
        """Test accidentals with Western system (#, ##, b, bb)."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Switch to Western pitch system
                await page.click('[data-menu-item="set-pitch-system"]')
                await page.wait_for_timeout(100)
                await page.keyboard.type("western")
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(200)

                # Test accidentals: "c# d## eb fbb"
                test_inputs = ["c#", "d##", "eb", "fbb"]

                for test_input in test_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")

                    # Measure input latency
                    latency = await self.measure_input_latency(page, test_input)

                    # Verify performance requirement
                    assert latency < 50, f"Input latency {latency:.2f}ms for '{test_input}' exceeds 50ms requirement"

                    # Get document state
                    doc_state = await self.get_document_state(page)

                    # Verify Cell was created for accidental
                    expected_cells = len(test_input)
                    assert doc_state["charCells"] >= expected_cells, \
                        f"Expected at least {expected_cells} Cells for '{test_input}', got {doc_state['charCells']}"

                    print(f"✓ Western accidental '{test_input}' passed (latency: {latency:.2f}ms)")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_mixed_notation_entry(self):
        """Test entry of mixed notation with spaces and elements."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Test mixed notation: "1 2# 3 4b 5"
                test_input = "1 2# 3 4b 5"

                # Measure input latency
                latency = await self.measure_input_latency(page, test_input)

                # Verify performance requirement
                assert latency < 50, f"Input latency {latency:.2f}ms exceeds 50ms requirement"

                # Get document state
                doc_state = await self.get_document_state(page)

                # Verify document structure
                assert doc_state["lines"] == 1, f"Expected 1 line, got {doc_state['lines']}"

                # Should have Cells for musical elements (spaces may not create Cells)
                assert doc_state["charCells"] >= 5, \
                    f"Expected at least 5 Cells for musical elements, got {doc_state['charCells']}"

                # Verify content
                content_text = " ".join(doc_state["content"])
                assert "1" in content_text, "Expected '1' in content"
                assert "2#" in content_text or "2 #" in content_text, "Expected '2#' in content"
                assert "3" in content_text, "Expected '3' in content"
                assert "4b" in content_text or "4 b" in content_text, "Expected '4b' in content"
                assert "5" in content_text, "Expected '5' in content"

                print(f"✓ Mixed notation entry passed (latency: {latency:.2f}ms)")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_realtime_chancell_creation(self):
        """Test that Cells are created in real-time during typing."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Type slowly and check Cell creation after each character
                test_input = "12345"

                for i, char in enumerate(test_input):
                    # Type one character
                    await page.keyboard.type(char)
                    await page.wait_for_timeout(50)  # Wait for processing

                    # Get document state
                    doc_state = await self.get_document_state(page)

                    # Should have i+1 Cells (assuming each musical note creates one)
                    expected_min_cells = i + 1
                    assert doc_state["charCells"] >= expected_min_cells, \
                        f"After typing {i+1} chars, expected at least {expected_min_cells} Cells, got {doc_state['charCells']}"

                print(f"✓ Real-time Cell creation passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_document_state_consistency(self):
        """Test that document state remains consistent after input."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Enter test notation
                test_input = "1 2# 3 4b 5"
                await page.keyboard.type(test_input)
                await page.wait_for_timeout(100)

                # Get document state multiple times to ensure consistency
                states = []
                for i in range(5):
                    doc_state = await self.get_document_state(page)
                    states.append(doc_state)
                    await page.wait_for_timeout(50)

                # Verify all states are identical
                first_state = states[0]
                for i, state in enumerate(states[1:], 1):
                    assert state["lines"] == first_state["lines"], \
                        f"State {i} has different line count: {state['lines']} vs {first_state['lines']}"
                    assert state["charCells"] == first_state["charCells"], \
                        f"State {i} has different Cell count: {state['charCells']} vs {first_state['charCells']}"
                    assert state["content"] == first_state["content"], \
                        f"State {i} has different content: {state['content']} vs {first_state['content']}"

                print(f"✓ Document state consistency passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_render_performance_after_input(self):
        """Test that rendering performance remains acceptable after input."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Enter a substantial amount of notation
                test_input = "1 2 3 4 5 6 7 1# 2# 3# 4# 5# 6# 7# 1b 2b 3b 4b 5b 6b 7b"
                await page.keyboard.type(test_input)
                await page.wait_for_timeout(200)  # Wait for rendering to complete

                # Get render statistics
                render_stats = await self.get_render_stats(page)

                # Verify render time is reasonable (should be under 100ms for this amount)
                assert "lastRenderTime" in render_stats, "Render stats missing lastRenderTime"
                assert render_stats["lastRenderTime"] < 100, \
                    f"Render time {render_stats['lastRenderTime']}ms exceeds 100ms limit"

                # Verify cells were rendered
                assert "cellsRendered" in render_stats, "Render stats missing cellsRendered"
                assert render_stats["cellsRendered"] > 0, "No cells were rendered"

                print(f"✓ Render performance passed (render time: {render_stats['lastRenderTime']:.2f}ms, cells: {render_stats['cellsRendered']})")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_pitch_system_persistence(self):
        """Test that pitch system setting persists during input."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Switch to Western system
                await page.click('[data-menu-item="set-pitch-system"]')
                await page.wait_for_timeout(100)
                await page.keyboard.type("western")
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(200)

                # Verify system changed
                doc_state = await self.get_document_state(page)
                assert doc_state["metadata"]["pitchSystem"] == "western", \
                    "Pitch system did not change to western"

                # Enter notation
                await page.keyboard.type("cdefg")
                await page.wait_for_timeout(100)

                # Verify system is still western after input
                doc_state = await self.get_document_state(page)
                assert doc_state["metadata"]["pitchSystem"] == "western", \
                    "Pitch system changed during input"

                print(f"✓ Pitch system persistence passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_input_error_handling(self):
        """Test that invalid input is handled gracefully."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Get initial document state
                initial_state = await self.get_document_state(page)
                initial_cells = initial_state["charCells"]

                # Type invalid characters (should be ignored or handled gracefully)
                invalid_inputs = ["xyz", "@#$", "123xyz", "c!d?e"]

                for invalid_input in invalid_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    # Type invalid input
                    await page.keyboard.type(invalid_input)
                    await page.wait_for_timeout(100)

                    # Get document state
                    doc_state = await self.get_document_state(page)

                    # Editor should still be functional
                    assert doc_state["lines"] >= 0, "Editor became non-functional after invalid input"

                    # Should not crash (we can still get state)
                    assert "error" not in doc_state, f"Editor error after invalid input '{invalid_input}': {doc_state}"

                print(f"✓ Input error handling passed")

            finally:
                await browser.close()

    @pytest.mark.asyncio
    async def test_performance_under_load(self):
        """Test performance under sustained input load."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.async_setup(page)

                # Generate a larger test input
                base_pattern = "1234567"
                test_input = " ".join([base_pattern] * 10)  # 70 characters total

                # Measure performance for sustained input
                start_time = time.perf_counter()
                await page.keyboard.type(test_input)
                await page.wait_for_timeout(200)  # Wait for processing to complete
                end_time = time.perf_counter()

                total_time = (end_time - start_time) * 1000  # Convert to ms
                avg_latency = total_time / len(test_input.replace(" ", ""))  # Exclude spaces from count

                # Verify performance requirements
                assert avg_latency < 50, \
                    f"Average latency {avg_latency:.2f}ms under load exceeds 50ms requirement"

                # Verify document was processed correctly
                doc_state = await self.get_document_state(page)
                assert doc_state["charCells"] > 50, \
                    f"Expected many Cells after sustained input, got {doc_state['charCells']}"

                # Verify rendering is still performant
                render_stats = await self.get_render_stats(page)
                assert render_stats["lastRenderTime"] < 200, \
                    f"Render time {render_stats['lastRenderTime']}ms after sustained input exceeds 200ms"

                print(f"✓ Performance under load passed (avg latency: {avg_latency:.2f}ms, total: {total_time:.2f}ms)")

            finally:
                await browser.close()


if __name__ == "__main__":
    # Run tests directly
    import sys

    # Configure pytest arguments
    pytest_args = [
        __file__,
        "-v",
        "--tb=short",
        "--browser=chromium",
        "--headless"
    ]

    # Run pytest
    sys.exit(pytest.main(pytest_args))