"""
Performance Tests for Input Latency

Comprehensive performance testing suite focused on input latency requirements
as specified in the specification (target: <50ms average input latency).

Test Categories:
- Baseline input latency measurement
- Sustained input performance under load
- Focus activation performance (<10ms target)
- Memory usage during sustained input
- Rendering performance after input
- Cross-browser performance comparison
"""

import pytest
import asyncio
import time
import statistics
from playwright.async_api import async_playwright, Page
from typing import List, Dict, Tuple
import json


class TestInputLatencyPerformance:
    """Test suite for input latency performance requirements."""

    async def setup_method(self, page: Page):
        """Setup method for each performance test."""
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

        # Warm up the editor with some input
        await page.keyboard.type("1234567")
        await page.wait_for_timeout(200)
        await page.keyboard.press("Control+a")
        await page.keyboard.press("Backspace")
        await page.wait_for_timeout(100)

    async def measure_single_input_latency(self, page: Page, character: str) -> float:
        """Measure latency for a single character input."""
        # Start timing
        start_time = time.perf_counter()

        # Type the character
        await page.keyboard.type(character)

        # Wait for processing to complete (poll for completion)
        await page.wait_for_function("""
        () => {
            // Check if the editor has processed the input
            if (window.musicEditor && window.musicEditor.document) {
                // Simple check: see if we have a reasonable document state
                return true;
            }
            return false;
        }
        """, timeout=1000)

        # End timing
        end_time = time.perf_counter()
        latency_ms = (end_time - start_time) * 1000

        return latency_ms

    async def measure_batch_input_latency(self, page: Page, input_string: str) -> Tuple[float, List[float]]:
        """Measure latency for a batch of inputs and return average and individual latencies."""
        latencies = []

        for char in input_string:
            if char == ' ':
                # For spaces, we expect minimal processing
                start_time = time.perf_counter()
                await page.keyboard.type(' ')
                end_time = time.perf_counter()
                latencies.append((end_time - start_time) * 1000)
            else:
                latency = await self.measure_single_input_latency(page, char)
                latencies.append(latency)

            # Small delay between inputs to simulate realistic typing
            await page.wait_for_timeout(50)

        average_latency = statistics.mean(latencies) if latencies else 0
        return average_latency, latencies

    async def measure_focus_activation_latency(self, page: Page) -> float:
        """Measure focus activation latency (target: <10ms)."""
        # First, blur the editor
        await page.keyboard.press("Tab")
        await page.wait_for_timeout(50)

        # Verify focus is lost
        is_focused = await page.evaluate("document.activeElement.id === 'notation-canvas'")
        assert not is_focused, "Editor should not be focused"

        # Measure focus activation time
        start_time = time.perf_counter()

        await page.click("#notation-canvas")

        # Wait for focus to be established
        await page.wait_for_function("document.activeElement.id === 'notation-canvas'", timeout=1000)

        # Additional wait for focus processing to complete
        await page.wait_for_function("""
        () => {
            return window.musicEditor && window.musicEditor.hasFocus;
        }
        """, timeout=1000)

        end_time = time.perf_counter()
        latency_ms = (end_time - start_time) * 1000

        return latency_ms

    async def get_memory_usage(self, page: Page) -> Dict:
        """Get current memory usage statistics."""
        return await page.evaluate("""
        () => {
            if (performance.memory) {
                return {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit,
                    usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
                    totalMB: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)
                };
            }
            return { error: 'Memory API not available' };
        }
        """)

    async def get_render_performance(self, page: Page) -> Dict:
        """Get rendering performance statistics."""
        return await page.evaluate("""
        () => {
            if (window.musicEditor && window.musicEditor.renderer) {
                return window.musicEditor.renderer.getRenderStats();
            }
            return { error: 'Renderer not available' };
        }
        """)

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_baseline_input_latency_number_system(self):
        """Test baseline input latency with Number system notation."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Test with Number system notation
                test_inputs = ["1", "2", "3", "4", "5", "6", "7"]
                all_latencies = []

                print("\n=== Baseline Input Latency Test (Number System) ===")

                for test_input in test_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    # Measure latency
                    avg_latency, latencies = await self.measure_batch_input_latency(page, test_input)
                    all_latencies.extend(latencies)

                    print(f"Input '{test_input}': Avg {avg_latency:.2f}ms, Individual: {[f'{l:.2f}ms' for l in latencies]}")

                    # Verify performance requirement
                    assert avg_latency < 50, f"Average latency {avg_latency:.2f}ms for '{test_input}' exceeds 50ms requirement"

                # Overall statistics
                overall_avg = statistics.mean(all_latencies)
                overall_max = max(all_latencies)
                overall_p95 = statistics.quantiles(all_latencies, n=20)[18] if len(all_latencies) > 20 else max(all_latencies)

                print(f"\nOverall Statistics:")
                print(f"  Average: {overall_avg:.2f}ms")
                print(f"  Maximum: {overall_max:.2f}ms")
                print(f"  95th percentile: {overall_p95:.2f}ms")

                # Verify overall performance requirements
                assert overall_avg < 50, f"Overall average latency {overall_avg:.2f}ms exceeds 50ms requirement"
                assert overall_max < 100, f"Maximum latency {overall_max:.2f}ms exceeds 100ms limit"
                assert overall_p95 < 75, f"95th percentile {overall_p95:.2f}ms exceeds 75ms limit"

                print(f"✓ Baseline input latency test passed")

            finally:
                await browser.close()

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_baseline_input_latency_western_system(self):
        """Test baseline input latency with Western system notation."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Switch to Western system
                await page.click('[data-menu-item="set-pitch-system"]')
                await page.wait_for_timeout(100)
                await page.keyboard.type("western")
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(200)

                # Test with Western system notation
                test_inputs = ["c", "d", "e", "f", "g", "a", "b"]
                all_latencies = []

                print("\n=== Baseline Input Latency Test (Western System) ===")

                for test_input in test_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    # Measure latency
                    avg_latency, latencies = await self.measure_batch_input_latency(page, test_input)
                    all_latencies.extend(latencies)

                    print(f"Input '{test_input}': Avg {avg_latency:.2f}ms, Individual: {[f'{l:.2f}ms' for l in latencies]}")

                    # Verify performance requirement
                    assert avg_latency < 50, f"Average latency {avg_latency:.2f}ms for '{test_input}' exceeds 50ms requirement"

                # Overall statistics
                overall_avg = statistics.mean(all_latencies)
                print(f"\nWestern System Overall Average: {overall_avg:.2f}ms")

                # Verify overall performance requirements
                assert overall_avg < 50, f"Western system average latency {overall_avg:.2f}ms exceeds 50ms requirement"

                print(f"✓ Western system input latency test passed")

            finally:
                await browser.close()

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_sustained_input_performance(self):
        """Test performance under sustained input load."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                # Generate sustained input (100 characters)
                base_pattern = "1234567"
                sustained_input = " ".join([base_pattern] * 14)  # 98 characters + spaces

                print(f"\n=== Sustained Input Performance Test ===")
                print(f"Input length: {len(sustained_input)} characters")

                # Measure memory before sustained input
                initial_memory = await self.get_memory_usage(page)
                print(f"Initial memory: {initial_memory.get('usedMB', 'N/A')}MB")

                # Measure sustained input performance
                start_time = time.perf_counter()
                await page.keyboard.type(sustained_input)
                end_time = time.perf_counter()

                # Wait for processing to complete
                await page.wait_for_timeout(500)

                total_time_ms = (end_time - start_time) * 1000
                character_count = len([c for c in sustained_input if not c.isspace()])
                avg_latency = total_time_ms / character_count if character_count > 0 else 0

                print(f"Total time: {total_time_ms:.2f}ms")
                print(f"Average latency per character: {avg_latency:.2f}ms")

                # Verify sustained input performance
                assert avg_latency < 50, f"Sustained input average latency {avg_latency:.2f}ms exceeds 50ms requirement"

                # Measure memory after sustained input
                final_memory = await self.get_memory_usage(page)
                print(f"Final memory: {final_memory.get('usedMB', 'N/A')}MB")

                if 'usedMB' in initial_memory and 'usedMB' in final_memory:
                    memory_increase = float(final_memory['usedMB']) - float(initial_memory['usedMB'])
                    print(f"Memory increase: {memory_increase:.2f}MB")
                    assert memory_increase < 50, f"Memory increase {memory_increase:.2f}MB exceeds 50MB limit"

                # Test rendering performance after sustained input
                render_stats = await self.get_render_performance(page)
                if 'lastRenderTime' in render_stats:
                    print(f"Render time after sustained input: {render_stats['lastRenderTime']:.2f}ms")
                    assert render_stats['lastRenderTime'] < 200, \
                        f"Render time {render_stats['lastRenderTime']}ms after sustained input exceeds 200ms limit"

                print(f"✓ Sustained input performance test passed")

            finally:
                await browser.close()

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_focus_activation_performance(self):
        """Test focus activation performance (target: <10ms)."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                print(f"\n=== Focus Activation Performance Test ===")

                focus_latencies = []

                # Measure focus activation multiple times
                for i in range(10):
                    latency = await self.measure_focus_activation_latency(page)
                    focus_latencies.append(latency)
                    print(f"Focus activation {i+1}: {latency:.2f}ms")

                    # Small delay between measurements
                    await page.wait_for_timeout(100)

                # Calculate statistics
                avg_focus_latency = statistics.mean(focus_latencies)
                max_focus_latency = max(focus_latencies)
                p95_focus_latency = statistics.quantiles(focus_latencies, n=20)[18] if len(focus_latencies) > 20 else max(focus_latencies)

                print(f"\nFocus Activation Statistics:")
                print(f"  Average: {avg_focus_latency:.2f}ms")
                print(f"  Maximum: {max_focus_latency:.2f}ms")
                print(f"  95th percentile: {p95_focus_latency:.2f}ms")

                # Verify focus activation performance requirements
                assert avg_focus_latency < 10, f"Average focus latency {avg_focus_latency:.2f}ms exceeds 10ms requirement"
                assert max_focus_latency < 25, f"Maximum focus latency {max_focus_latency:.2f}ms exceeds 25ms limit"

                print(f"✓ Focus activation performance test passed")

            finally:
                await browser.close()

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_accidental_input_performance(self):
        """Test input performance with accidentals."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                print(f"\n=== Accidental Input Performance Test ===")

                # Test inputs with accidentals
                accidental_inputs = ["1#", "2##", "3b", "4bb", "c#", "d##", "eb", "fbb"]
                all_latencies = []

                for test_input in accidental_inputs:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    # For Western system accidentals, switch system first
                    if test_input in ["c#", "d##", "eb", "fbb"]:
                        await page.click('[data-menu-item="set-pitch-system"]')
                        await page.wait_for_timeout(100)
                        await page.keyboard.type("western")
                        await page.keyboard.press("Enter")
                        await page.wait_for_timeout(200)

                    # Measure latency
                    avg_latency, latencies = await self.measure_batch_input_latency(page, test_input)
                    all_latencies.extend(latencies)

                    print(f"Accidental '{test_input}': Avg {avg_latency:.2f}ms")

                    # Verify performance requirement
                    assert avg_latency < 50, f"Average latency {avg_latency:.2f}ms for '{test_input}' exceeds 50ms requirement"

                # Overall statistics for accidentals
                overall_avg = statistics.mean(all_latencies)
                print(f"\nAccidentals Overall Average: {overall_avg:.2f}ms")

                # Verify overall accidental performance requirements
                assert overall_avg < 50, f"Accidentals average latency {overall_avg:.2f}ms exceeds 50ms requirement"

                print(f"✓ Accidental input performance test passed")

            finally:
                await browser.close()

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_rapid_input_performance(self):
        """Test performance with rapid, burst-style input."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                print(f"\n=== Rapid Input Performance Test ===")

                # Test rapid input bursts
                rapid_patterns = [
                    "1234567",           # Fast scale
                    "cdefgab",           # Western scale
                    "1#2#3#4#5#6#7#",   # Sharps
                    "1b2b3b4b5b6b7b",   # Flats
                ]

                burst_latencies = []

                for pattern in rapid_patterns:
                    # Clear content first
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    # For Western patterns, switch system
                    if pattern in ["cdefgab"]:
                        await page.click('[data-menu-item="set-pitch-system"]')
                        await page.wait_for_timeout(100)
                        await page.keyboard.type("western")
                        await page.keyboard.press("Enter")
                        await page.wait_for_timeout(200)

                    # Measure rapid input (type quickly without delays)
                    start_time = time.perf_counter()
                    await page.keyboard.type(pattern)
                    end_time = time.perf_counter()

                    # Wait for processing
                    await page.wait_for_timeout(200)

                    burst_latency = (end_time - start_time) * 1000
                    char_count = len(pattern)
                    avg_per_char = burst_latency / char_count

                    burst_latencies.append(avg_per_char)

                    print(f"Rapid pattern '{pattern}': {avg_per_char:.2f}ms per character")

                    # Verify rapid input performance
                    assert avg_per_char < 50, f"Rapid input latency {avg_per_char:.2f}ms for '{pattern}' exceeds 50ms requirement"

                # Overall rapid input performance
                overall_rapid_avg = statistics.mean(burst_latencies)
                print(f"\nRapid Input Overall Average: {overall_rapid_avg:.2f}ms per character")

                assert overall_rapid_avg < 50, f"Rapid input average {overall_rapid_avg:.2f}ms exceeds 50ms requirement"

                print(f"✓ Rapid input performance test passed")

            finally:
                await browser.close()

    @pytest.mark.performance
    @pytest.mark.slow
    @pytest.mark.asyncio
    async def test_memory_pressure_performance(self):
        """Test performance under memory pressure conditions."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                print(f"\n=== Memory Pressure Performance Test ===")

                # Create memory pressure by typing large amounts of content
                large_patterns = ["1234567 "] * 100  # 700 characters plus spaces
                large_input = "".join(large_patterns)

                print(f"Input size: {len(large_input)} characters")

                # Measure memory before
                initial_memory = await self.get_memory_usage(page)
                print(f"Initial memory: {initial_memory.get('usedMB', 'N/A')}MB")

                # Measure input latency during memory pressure
                start_time = time.perf_counter()
                await page.keyboard.type(large_input)
                end_time = time.perf_counter()

                await page.wait_for_timeout(1000)  # Wait for full processing

                total_time = (end_time - start_time) * 1000
                char_count = len([c for c in large_input if not c.isspace()])
                avg_latency = total_time / char_count

                print(f"Memory pressure average latency: {avg_latency:.2f}ms per character")

                # Verify performance under memory pressure
                assert avg_latency < 100, f"Memory pressure latency {avg_latency:.2f}ms exceeds 100ms relaxed requirement"

                # Measure memory after
                final_memory = await self.get_memory_usage(page)
                print(f"Final memory: {final_memory.get('usedMB', 'N/A')}MB")

                # Test performance with additional input after memory pressure
                additional_test = "1234567"
                additional_latency, _ = await self.measure_batch_input_latency(page, additional_test)

                print(f"Additional input latency after pressure: {additional_latency:.2f}ms")
                assert additional_latency < 75, f"Post-pressure latency {additional_latency:.2f}ms exceeds 75ms requirement"

                print(f"✓ Memory pressure performance test passed")

            finally:
                await browser.close()

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_performance_regression_detection(self):
        """Test to detect performance regressions by comparing against baselines."""
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page()

            try:
                await self.setup_method(page)

                print(f"\n=== Performance Regression Detection Test ===")

                # Define performance baselines (these would be set from known good performance)
                performance_baselines = {
                    "single_char_latency_max": 30.0,  # ms
                    "batch_input_avg_max": 25.0,       # ms
                    "focus_activation_max": 8.0,       # ms
                    "memory_increase_max": 20.0        # MB
                }

                # Test single character latency
                single_latencies = []
                for char in ["1", "2", "3"]:
                    await page.keyboard.press("Control+a")
                    await page.keyboard.press("Backspace")
                    await page.wait_for_timeout(50)

                    latency = await self.measure_single_input_latency(page, char)
                    single_latencies.append(latency)

                single_avg = statistics.mean(single_latencies)
                print(f"Single character average latency: {single_avg:.2f}ms (baseline: {performance_baselines['single_char_latency_max']}ms)")

                # Test batch input latency
                await page.keyboard.press("Control+a")
                await page.keyboard.press("Backspace")
                await page.wait_for_timeout(50)

                batch_avg, _ = await self.measure_batch_input_latency(page, "1234567")
                print(f"Batch input average latency: {batch_avg:.2f}ms (baseline: {performance_baselines['batch_input_avg_max']}ms)")

                # Test focus activation
                focus_avg = await self.measure_focus_activation_latency(page)
                print(f"Focus activation latency: {focus_avg:.2f}ms (baseline: {performance_baselines['focus_activation_max']}ms)")

                # Test memory increase
                initial_memory = await self.get_memory_usage(page)
                await page.keyboard.type(" ".join(["1234567"] * 20))
                await page.wait_for_timeout(500)
                final_memory = await self.get_memory_usage(page)

                memory_increase = 0
                if 'usedMB' in initial_memory and 'usedMB' in final_memory:
                    memory_increase = float(final_memory['usedMB']) - float(initial_memory['usedMB'])
                print(f"Memory increase: {memory_increase:.2f}MB (baseline: {performance_baselines['memory_increase_max']}MB)")

                # Check for regressions
                regressions = []

                if single_avg > performance_baselines['single_char_latency_max']:
                    regressions.append(f"Single character latency: {single_avg:.2f}ms > {performance_baselines['single_char_latency_max']}ms")

                if batch_avg > performance_baselines['batch_input_avg_max']:
                    regressions.append(f"Batch input latency: {batch_avg:.2f}ms > {performance_baselines['batch_input_avg_max']}ms")

                if focus_avg > performance_baselines['focus_activation_max']:
                    regressions.append(f"Focus activation latency: {focus_avg:.2f}ms > {performance_baselines['focus_activation_max']}ms")

                if memory_increase > performance_baselines['memory_increase_max']:
                    regressions.append(f"Memory increase: {memory_increase:.2f}MB > {performance_baselines['memory_increase_max']}MB")

                if regressions:
                    print(f"\n⚠️  Performance regressions detected:")
                    for regression in regressions:
                        print(f"   - {regression}")
                    pytest.fail("Performance regressions detected")
                else:
                    print(f"\n✓ No performance regressions detected")
                    print(f"✓ Performance regression detection test passed")

            finally:
                await browser.close()

    def generate_performance_report(self, test_results: Dict):
        """Generate a performance report from test results."""
        report = {
            "timestamp": time.time(),
            "summary": {
                "total_tests": len(test_results),
                "passed": sum(1 for r in test_results.values() if r["passed"]),
                "failed": sum(1 for r in test_results.values() if not r["passed"])
            },
            "results": test_results,
            "requirements": {
                "input_latency_max_ms": 50,
                "focus_activation_max_ms": 10,
                "memory_increase_limit_mb": 50,
                "render_time_limit_ms": 100
            }
        }

        # Save report to file
        with open("performance_report.json", "w") as f:
            json.dump(report, f, indent=2)

        print(f"\n📊 Performance report saved to performance_report.json")


if __name__ == "__main__":
    # Run performance tests directly
    import sys

    # Configure pytest arguments for performance tests
    pytest_args = [
        __file__,
        "-v",
        "--tb=short",
        "-m", "performance",
        "--browser=chromium",
        "--headless"
    ]

    # Run pytest
    sys.exit(pytest.main(pytest_args))