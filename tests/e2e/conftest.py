"""
Pytest configuration for E2E tests.

Provides common fixtures and setup for end-to-end testing of the Music Notation Editor.
"""

import pytest
import asyncio
from playwright.async_api import async_playwright, Page, Browser, BrowserContext
import os
import sys


# Add the project root to Python path for imports
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def browser():
    """Browser fixture for E2E tests."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=os.getenv("HEADLESS", "true").lower() == "true",
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-web-security",
                "--disable-features=VizDisplayCompositor"
            ]
        )
        yield browser
        await browser.close()


@pytest.fixture
async def page(browser: Browser):
    """Page fixture for E2E tests."""
    context = await browser.new_context(
        viewport={"width": 1200, "height": 800},
        user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    )
    page = await context.new_page()

    # Setup global error handling
    page.on("pageerror", lambda error: print(f"Page error: {error}"))
    page.on("requestfailed", lambda request: print(f"Request failed: {request.url}"))

    yield page

    await context.close()


@pytest.fixture
async def editor_page(page: Page):
    """Page fixture with editor initialized."""
    # Navigate to the editor
    await page.goto("http://localhost:3000", wait_until="domcontentloaded")

    # Wait for the editor to initialize
    try:
        await page.wait_for_selector("#notation-canvas", timeout=10000)
        await page.wait_for_function(
            "window.musicEditor && window.musicEditor.isReady",
            timeout=10000
        )
    except Exception as e:
        # Take screenshot for debugging
        await page.screenshot(path="test-failure-setup.png")
        raise Exception(f"Editor failed to initialize: {e}")

    # Focus the editor
    await page.click("#notation-canvas")
    await page.wait_for_function("document.activeElement.id === 'notation-canvas'", timeout=5000)

    # Clear any existing content
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Backspace")
    await page.wait_for_timeout(100)

    yield page


@pytest.fixture
async def development_server():
    """Fixture to ensure development server is running."""
    import requests
    import subprocess
    import time

    server_url = "http://localhost:3000"
    max_retries = 30
    retry_interval = 2

    # Check if server is already running
    for _ in range(max_retries):
        try:
            response = requests.get(f"{server_url}/", timeout=5)
            if response.status_code == 200:
                print(f"✓ Development server is running at {server_url}")
                return server_url
        except requests.exceptions.RequestException:
            pass

        time.sleep(retry_interval)

    # If server is not running, try to start it
    print("Development server not found, attempting to start...")
    try:
        # Start npm run dev (this assumes npm is installed and dependencies are ready)
        dev_process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=project_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        # Wait for server to start
        for i in range(max_retries):
            try:
                response = requests.get(f"{server_url}/", timeout=5)
                if response.status_code == 200:
                    print(f"✓ Development server started at {server_url}")
                    yield server_url

                    # Clean up: terminate the development server
                    dev_process.terminate()
                    dev_process.wait(timeout=10)
                    return
            except requests.exceptions.RequestException:
                pass

            time.sleep(retry_interval)

        # If we get here, server failed to start
        dev_process.terminate()
        dev_process.wait(timeout=10)
        raise Exception(f"Failed to start development server within {max_retries * retry_interval} seconds")

    except Exception as e:
        raise Exception(f"Could not start development server: {e}")


@pytest.fixture
def test_data():
    """Provide test data for musical notation."""
    return {
        "number_system": {
            "basic": "1234567",
            "with_accidentals": "1# 2## 3b 4bb 5 6 7",
            "complex": "1 2# 3 4b 5# 6 7b 1 2 3 4 5 6 7",
            "repetitive": " ".join(["1234567"] * 5)
        },
        "western_system": {
            "basic": "cdefgab",
            "uppercase": "CDEFGAB",
            "with_accidentals": "c# d## eb fbb g a b",
            "complex": "c d# e f g# a b c d e f g a b",
            "repetitive": " ".join(["cdefgab"] * 5)
        },
        "invalid": {
            "numbers_too_high": "89",
            "invalid_chars": "xyz!@#$%",
            "mixed_invalid": "1x2y3z",
            "empty": "",
            "only_spaces": "   "
        }
    }


@pytest.fixture
def performance_thresholds():
    """Performance thresholds for testing."""
    return {
        "input_latency_max_ms": 50,
        "render_time_max_ms": 100,
        "render_time_under_load_ms": 200,
        "sustained_input_avg_latency_ms": 50,
        "focus_activation_max_ms": 50,
        "memory_increase_limit_mb": 50
    }


# Custom pytest markers
def pytest_configure(config):
    """Configure custom pytest markers."""
    config.addinivalue_line(
        "markers", "e2e: mark test as end-to-end test"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as performance test"
    )
    config.addinivalue_line(
        "markers", "accessibility: mark test as accessibility test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running test"
    )


# Helper functions for tests
async def wait_for_editor_ready(page: Page, timeout: int = 10000):
    """Wait for the editor to be ready."""
    await page.wait_for_function(
        "window.musicEditor && window.musicEditor.isReady",
        timeout=timeout
    )


async def get_document_state(page: Page) -> dict:
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
            ) : 0,
            isReady: window.musicEditor.isReady,
            hasFocus: document.activeElement && document.activeElement.id === 'notation-canvas'
        };
    }
    """)


async def measure_input_latency(page: Page, keystrokes: str) -> float:
    """Measure input latency for a series of keystrokes."""
    import time

    start_time = time.perf_counter()
    await page.keyboard.type(keystrokes)

    # Wait for processing to complete
    await page.wait_for_timeout(100)

    end_time = time.perf_counter()
    keystroke_count = len([c for c in keystrokes if not c.isspace()])

    return (end_time - start_time) / keystroke_count * 1000 if keystroke_count > 0 else 0


async def clear_editor(page: Page):
    """Clear all content from the editor."""
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Backspace")
    await page.wait_for_timeout(100)


async def focus_editor(page: Page):
    """Focus the editor canvas."""
    await page.click("#notation-canvas")
    await page.wait_for_function("document.activeElement.id === 'notation-canvas'", timeout=5000)


async def take_screenshot_on_failure(page: Page, test_name: str):
    """Take a screenshot when a test fails."""
    screenshot_path = f"test-failure-{test_name}.png"
    await page.screenshot(path=screenshot_path, full_page=True)
    print(f"Screenshot saved: {screenshot_path}")


# Error handling and reporting
@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Hook to take screenshots on test failure."""
    outcome = yield
    rep = outcome.get_result()

    if rep.when == "call" and rep.failed:
        try:
            # Try to get the page fixture and take a screenshot
            page = item.funcargs.get("page")
            if page:
                test_name = item.name.replace("/", "_").replace(":", "_")
                asyncio.create_task(take_screenshot_on_failure(page, test_name))
        except Exception:
            pass  # Ignore screenshot errors


# Skip tests if development server is not available
def pytest_collection_modifyitems(config, items):
    """Skip tests that require the development server if it's not available."""
    import requests

    try:
        response = requests.get("http://localhost:3000/", timeout=2)
        server_available = response.status_code == 200
    except requests.exceptions.RequestException:
        server_available = False

    if not server_available:
        skip_mark = pytest.mark.skip(reason="Development server not available at http://localhost:3000")
        for item in items:
            if "page" in item.fixturenames or "editor_page" in item.fixturenames:
                item.add_marker(skip_mark)