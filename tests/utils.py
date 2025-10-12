"""
Playwright Testing Utilities for Music Notation Editor POC

Provides common utilities for E2E testing including:
- Page setup and teardown
- Musical notation helpers
- Performance measurement
- Error handling and logging
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from playwright.async_api import Page, Browser, BrowserContext, expect
import pytest


class MusicNotationTestUtils:
    """Utilities for testing the Music Notation Editor"""

    def __init__(self, page: Page):
        self.page = page
        self.base_url = "http://localhost:8080"

    async def setup_page(self) -> None:
        """Setup the page for testing"""
        await self.page.goto(self.base_url)
        await self.page.wait_for_load_state('networkidle')

        # Wait for WASM module to load
        await self.page.wait_for_function(
            "() => window.musicEditor && window.musicEditor.wasmModule",
            timeout=10000
        )

        # Focus the editor
        await self.focus_editor()

    async def focus_editor(self) -> None:
        """Focus the notation editor canvas"""
        canvas = self.page.locator("#notation-canvas")
        await canvas.click()
        await canvas.wait_for_state('visible')

    async def wait_for_editor_ready(self) -> None:
        """Wait for the editor to be fully ready"""
        # Check if canvas has focus
        canvas = self.page.locator("#notation-canvas")
        await expect(canvas).to_be_focused()

        # Check if performance indicator shows ready
        try:
            indicator = self.page.locator("#performance-indicator")
            await expect(indicator).to_have_class(/success/)
        except:
            # Performance indicator might not be visible yet
            pass

    async def enter_notation(self, text: str) -> None:
        """Enter musical notation text"""
        await self.focus_editor()
        await self.page.keyboard.type(text)

    async def get_document_state(self) -> Dict[str, Any]:
        """Get current document state from debug panel"""
        doc_json = self.page.locator("#document-json")
        text = await doc_json.text_content()
        return json.loads(text) if text else {}

    async def get_char_cells(self) -> List[Dict[str, Any]]:
        """Get all Cells from document state"""
        state = await self.get_document_state()
        cells = []

        if 'lines' in state and state['lines']:
            line = state['lines'][0]
            if 'lanes' in line:
                for lane_index, lane in enumerate(line['lanes']):
                    for cell in lane:
                        cells.append({
                            'grapheme': cell.get('grapheme', ''),
                            'kind': cell.get('kind', 0),
                            'lane': lane_index,
                            'col': cell.get('col', 0),
                            'flags': cell.get('flags', 0)
                        })
        return cells

    async def get_cursor_position(self) -> int:
        """Get current cursor position"""
        position_text = self.page.locator("#cursor-position")
        return int(await position_text.text_content())

    async def get_char_count(self) -> int:
        """Get character count from status bar"""
        count_text = self.page.locator("#char-count")
        return int(await count_text.text_content())

    async def wait_for_beat_rendering(self, timeout: int = 2000) -> None:
        """Wait for beat loops to be rendered"""
        await self.page.wait_for_function(
            "() => document.querySelectorAll('.beat-loop').length > 0",
            timeout=timeout
        )

    async def measure_performance(self, action: str, operation) -> float:
        """Measure performance of an operation in milliseconds"""
        # Clear any existing performance logs
        await self.page.evaluate("() => console.clear()")

        # Start performance measurement
        await self.page.evaluate(f"() => console.time('{action}')")

        # Execute the operation
        start_time = time.time()
        result = await operation
        end_time = time.time()

        # Stop performance measurement
        await self.page.evaluate(f"() => console.timeEnd('{action}')")

        return (end_time - start_time) * 1000  # Convert to milliseconds

    async def check_console_errors(self) -> List[str]:
        """Check for console errors"""
        # Switch to console errors tab
        await self.page.click("#tab-console-errors")
        await self.page.wait_for_selector("#console-errors-list", state='visible')

        errors_list = self.page.locator("#console-errors-list")
        error_elements = await errors_list.locator(".error").all()

        errors = []
        for element in error_elements:
            errors.append(await element.text_content())

        return errors

    async def check_console_logs(self) -> List[str]:
        """Check console logs"""
        # Switch to console log tab
        await self.page.click("#tab-console-log")
        await self.page.wait_for_selector("#console-log-list", state='visible')

        logs_list = self.page.locator("#console-log-list")
        log_elements = await logs_list.locator("div").all()

        logs = []
        for element in log_elements:
            text = await element.text_content()
            if text and text != "No logs":
                logs.append(text)

        return logs

    async def apply_slur(self) -> None:
        """Apply slur to current selection using Alt+S"""
        await self.page.keyboard.press('Alt+s')

    async def apply_octave(self, octave: str) -> None:
        """Apply octave to current selection (u, m, l)"""
        if octave in ['u', 'm', 'l']:
            await self.page.keyboard.press(f'Alt+{octave}')

    async def create_selection(self, start_pos: int, end_pos: int) -> None:
        """Create a selection from start_pos to end_pos"""
        # Go to start position (this would need cursor navigation implementation)
        # For now, just use keyboard navigation to approximate
        await self.focus_editor()

        # Navigate to approximate position (this is simplified)
        for _ in range(start_pos):
            await self.page.keyboard.press('ArrowRight')

        # Create selection
        await self.page.keyboard.down('Shift')
        for _ in range(end_pos - start_pos):
            await self.page.keyboard.press('ArrowRight')
        await self.page.keyboard.up('Shift')

    async def navigate_arrows(self, direction: str, count: int = 1) -> None:
        """Navigate using arrow keys"""
        key_map = {
            'left': 'ArrowLeft',
            'right': 'ArrowRight',
            'up': 'ArrowUp',
            'down': 'ArrowDown',
            'home': 'Home',
            'end': 'End'
        }

        key = key_map.get(direction.lower())
        if key:
            for _ in range(count):
                await self.page.keyboard.press(key)

    async def delete_selection(self) -> None:
        """Delete current selection"""
        await self.page.keyboard.press('Backspace')

    async def set_pitch_system(self, system: str) -> None:
        """Set pitch system via menu"""
        await self.page.click("#file-menu-button")
        await self.page.click("#menu-set-pitch-system")
        # Would need to handle the pitch system selection dialog

    async def save_document(self) -> None:
        """Save document via menu"""
        await self.page.click("#file-menu-button")
        await self.page.click("#menu-save")

    async def load_document(self, content: str) -> None:
        """Load document content"""
        # This would need file handling implementation
        # For now, we can simulate by setting document state directly
        await self.page.evaluate(f"""
            () => {{
                if (window.musicEditor) {{
                    window.musicEditor.loadDocument({json.dumps(content)});
                }}
            }}
        """)


class PerformanceMonitor:
    """Monitor performance during tests"""

    def __init__(self, page: Page):
        self.page = page
        self.measurements = []

    async def start_measurement(self, name: str) -> None:
        """Start a performance measurement"""
        await self.page.evaluate(f"() => performance.mark('{name}-start')")

    async def end_measurement(self, name: str) -> float:
        """End a performance measurement and return duration"""
        await self.page.evaluate(f"() => performance.mark('{name}-end')")

        duration = await self.page.evaluate(f"""
            () => performance.measure('{name}', '{name}-start', '{name}-end').duration
        """)

        self.measurements.append({
            'name': name,
            'duration': duration,
            'timestamp': time.time()
        })

        return duration

    def get_measurements(self) -> List[Dict[str, Any]]:
        """Get all measurements"""
        return self.measurements.copy()

    def assert_performance_within(self, name: str, max_ms: float) -> None:
        """Assert that a measurement is within time limit"""
        measurement = next((m for m in self.measurements if m['name'] == name), None)
        if measurement:
            assert measurement['duration'] <= max_ms, f"{name} took {measurement['duration']:.2f}ms, expected <= {max_ms}ms"
        else:
            raise AssertionError(f"No measurement found for {name}")


@pytest.fixture
async def page(browser: Browser):
    """Create a page with proper setup for music notation testing"""
    context = await browser.new_context(
        viewport={'width': 1200, 'height': 800},
        user_agent='Music Notation Editor Test Suite'
    )

    page = await context.new_page()

    # Setup error handling
    page.on("pageerror", lambda error: print(f"Page error: {error}"))
    page.on("console", lambda msg: print(f"Console {msg.type}: {msg.text}"))

    yield page

    await context.close()


@pytest.fixture
async def music_editor(page: Page):
    """Create a MusicNotationTestUtils instance"""
    utils = MusicNotationTestUtils(page)
    await utils.setup_page()
    await utils.wait_for_editor_ready()
    yield utils


@pytest.fixture
async def performance_monitor(page: Page):
    """Create a PerformanceMonitor instance"""
    yield PerformanceMonitor(page)


# Common test data
SAMPLE_NOTATION = {
    'number_system': '12345671',
    'western_system': 'cdefgabC',
    'with_accidentals': '1# 2b 3 4# 5b 6 7 1',
    'with_dashes': '1--2 3-4 5--6-7-1',
    'with_barlines': '123|456|71',
}

PERFORMANCE_TARGETS = {
    'focus_activation': 10,      # ms
    'typing_latency': 50,        # ms
    'navigation_speed': 16,      # ms (60fps)
    'beat_derivation': 10,       # ms
    'render_time': 10,          # ms
}

# Helper functions for common test patterns
async def verify_notation_rendering(utils: MusicNotationTestUtils, expected_cells: List[Dict[str, Any]]) -> None:
    """Verify that notation is rendered correctly"""
    cells = await utils.get_char_cells()

    assert len(cells) == len(expected_cells), f"Expected {len(expected_cells)} cells, got {len(cells)}"

    for i, (actual, expected) in enumerate(zip(cells, expected_cells)):
        for key, value in expected.items():
            assert actual[key] == value, f"Cell {i}: expected {key}={value}, got {actual[key]}"


async def verify_performance_targets(monitor: PerformanceMonitor) -> None:
    """Verify all performance targets are met"""
    measurements = monitor.get_measurements()

    for name, target_ms in PERFORMANCE_TARGETS.items():
        measurement = next((m for m in measurements if m['name'] == name), None)
        if measurement:
            assert measurement['duration'] <= target_ms, \
                f"{name} exceeded target: {measurement['duration']:.2f}ms > {target_ms}ms"
        else:
            print(f"Warning: No measurement for {name}")


async def verify_no_console_errors(utils: MusicNotationTestUtils) -> None:
    """Verify there are no console errors"""
    errors = await utils.check_console_errors()
    assert len(errors) == 0, f"Console errors found: {errors}"