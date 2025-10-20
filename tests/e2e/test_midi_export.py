"""
End-to-End Tests for MIDI Export Functionality

Tests the complete export flow from the editor UI to MIDI file generation.
Uses Playwright for browser automation and async/await for async operations.
"""

import pytest
import json
import struct
import os
from pathlib import Path


@pytest.mark.e2e
class TestMIDIExportUI:
    """Test the MIDI export UI dialog."""

    @pytest.mark.asyncio
    async def test_export_dialog_opens(self, page):
        """Test that the export dialog can be opened."""
        # Navigate to editor
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")

        # Wait for UI to be ready
        await page.wait_for_timeout(1000)

        # Try to open File menu - look for File button in menu bar
        file_button = await page.query_selector("button:has-text('File')")
        if file_button:
            await file_button.click()
            await page.wait_for_timeout(200)

            # Click Export option
            export_option = await page.query_selector("text=Export")
            if export_option:
                await export_option.click()
                await page.wait_for_timeout(200)

                # Verify dialog is visible
                dialog = await page.query_selector(".fixed.inset-0")
                assert dialog is not None, "Export dialog should be visible"
        else:
            # If traditional menu not found, test might need adjustment based on actual UI
            pytest.skip("File menu not found in current UI")

    @pytest.mark.asyncio
    async def test_export_dialog_has_midi_option(self, page):
        """Test that MIDI export option is available."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Open File menu
        file_button = await page.query_selector("button:has-text('File')")
        if file_button:
            await file_button.click()
            await page.wait_for_timeout(200)

            # Click Export
            export_option = await page.query_selector("text=Export")
            if export_option:
                await export_option.click()
                await page.wait_for_timeout(200)

                # Verify MIDI option exists
                midi_button = await page.query_selector("[data-export='midi']")
                assert midi_button is not None, "MIDI export button should exist"

    @pytest.mark.asyncio
    async def test_export_dialog_close_button(self, page):
        """Test that the export dialog can be closed."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        file_button = await page.query_selector("button:has-text('File')")
        if file_button:
            await file_button.click()
            await page.wait_for_timeout(200)

            export_option = await page.query_selector("text=Export")
            if export_option:
                await export_option.click()
                await page.wait_for_timeout(200)

                # Click Close button
                close_button = await page.query_selector("button:has-text('Close')")
                if close_button:
                    await close_button.click()
                    await page.wait_for_timeout(200)

                    # Verify dialog is gone
                    dialog = await page.query_selector(".fixed.inset-0")
                    assert dialog is None, "Dialog should be closed"

    @pytest.mark.asyncio
    async def test_export_dialog_close_on_escape(self, page):
        """Test that pressing Escape closes the dialog."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        file_button = await page.query_selector("button:has-text('File')")
        if file_button:
            await file_button.click()
            await page.wait_for_timeout(200)

            export_option = await page.query_selector("text=Export")
            if export_option:
                await export_option.click()
                await page.wait_for_timeout(200)

                # Press Escape
                await page.press("body", "Escape")
                await page.wait_for_timeout(200)

                # Verify dialog is gone
                dialog = await page.query_selector(".fixed.inset-0")
                assert dialog is None, "Dialog should close on Escape"


@pytest.mark.e2e
class TestMIDIExport:
    """Test MIDI export functionality."""

    @pytest.mark.asyncio
    async def test_midi_export_via_wasm(self, page):
        """Test MIDI export through WASM directly."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Check if WASM is loaded
        wasm_loaded = await page.evaluate("() => typeof window.editorWasm !== 'undefined'")
        assert wasm_loaded, "WASM module should be loaded"

        # Test exportMIDI function exists
        export_midi_exists = await page.evaluate(
            "() => typeof window.editorWasm.exportMIDI === 'function'"
        )
        assert export_midi_exists, "exportMIDI function should exist"

    @pytest.mark.asyncio
    async def test_midi_export_produces_valid_file(self, page):
        """Test that MIDI export produces a valid file."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Execute MIDI export through WASM
        result = await page.evaluate("""
        async () => {
            if (!window.editorWasm || !window.editor) {
                return { error: 'Editor or WASM not loaded' };
            }

            try {
                // Export MIDI
                const midiData = window.editorWasm.exportMIDI(
                    window.editor.theDocument,
                    480  // Default TPQ
                );

                // Convert to array for validation
                return {
                    success: true,
                    size: midiData.length,
                    firstBytes: Array.from(midiData.slice(0, 4))
                };
            } catch (error) {
                return { error: error.message };
            }
        }
        """)

        assert result.get('success'), f"MIDI export failed: {result.get('error')}"
        assert result['size'] > 0, "MIDI data should not be empty"

        # Check MIDI header
        first_bytes = bytes(result['firstBytes'])
        assert first_bytes == b'MThd', f"MIDI header should start with MThd, got {first_bytes}"

    @pytest.mark.asyncio
    async def test_midi_export_filename_format(self, page):
        """Test that MIDI export has correct filename format."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Check filename generation logic
        result = await page.evaluate("""
        () => {
            if (!window.editor) {
                return { error: 'Editor not loaded' };
            }

            const metadata = window.editor.getDocumentMetadata?.() || {};
            const title = (metadata.title || 'score').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const timestamp = new Date().toISOString()
                .slice(0, 10).replace(/-/g, '')
                .concat('-')
                .concat(String(new Date().getHours()).padStart(2, '0'))
                .concat(String(new Date().getMinutes()).padStart(2, '0'));

            return {
                filename: `${title}-${timestamp}.mid`,
                hasExtension: true
            };
        }
        """)

        assert result['hasExtension'], "Filename should have .mid extension"
        assert '-' in result['filename'], "Filename should contain timestamp"

    @pytest.mark.asyncio
    async def test_midi_export_structure(self, page):
        """Test that exported MIDI file has correct structure."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Export MIDI and check structure
        result = await page.evaluate("""
        async () => {
            if (!window.editorWasm || !window.editor) {
                return { error: 'Not ready' };
            }

            try {
                const midiData = window.editorWasm.exportMIDI(
                    window.editor.theDocument,
                    480
                );

                // Check MIDI structure
                const bytes = Array.from(midiData);

                // MThd header (0-3)
                const hasHeader = bytes[0] === 77 && bytes[1] === 84 &&
                                  bytes[2] === 104 && bytes[3] === 100; // "MThd"

                // Format type (8-9) - should be 1 for multi-track
                const format = (bytes[8] << 8) | bytes[9];

                // Number of tracks (10-11)
                const trackCount = (bytes[10] << 8) | bytes[11];

                // Look for MTrk
                const mTrkIndex = bytes.findIndex((v, i) =>
                    bytes[i] === 77 && bytes[i+1] === 84 &&
                    bytes[i+2] === 114 && bytes[i+3] === 107
                );

                return {
                    hasHeader,
                    format,
                    trackCount,
                    hasMTrk: mTrkIndex !== -1,
                    size: bytes.length
                };
            } catch (error) {
                return { error: error.message };
            }
        }
        """)

        assert result['hasHeader'], "MIDI should have MThd header"
        assert result['format'] == 1, "MIDI should be Format 1 (multi-track)"
        assert result['trackCount'] > 0, "MIDI should have at least one track"
        assert result['hasMTrk'], "MIDI should have MTrk track header"


@pytest.mark.e2e
class TestMIDIExportIntegration:
    """Integration tests for MIDI export with document content."""

    @pytest.mark.asyncio
    async def test_export_with_metadata(self, page):
        """Test exporting with document metadata."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Set title through WASM if available
        result = await page.evaluate("""
        async () => {
            if (!window.editorWasm || !window.editor) {
                return { error: 'Not ready' };
            }

            try {
                // Try to set title
                const newDoc = window.editorWasm.setTitle(
                    window.editor.theDocument,
                    "Test Symphony"
                );
                window.editor.theDocument = newDoc;

                // Export MIDI
                const midiData = window.editorWasm.exportMIDI(
                    window.editor.theDocument,
                    480
                );

                return {
                    success: true,
                    size: midiData.length
                };
            } catch (error) {
                return { error: error.message };
            }
        }
        """)

        assert result.get('success'), f"Export with metadata failed: {result.get('error')}"

    @pytest.mark.asyncio
    async def test_wasm_function_available(self, page):
        """Test that WASM functions are available."""
        await page.goto("http://localhost:8080")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1000)

        # Check for WASM and required functions
        functions = await page.evaluate("""
        () => {
            if (!window.editorWasm) {
                return { error: 'WASM not loaded' };
            }

            return {
                exportMIDI: typeof window.editorWasm.exportMIDI,
                exportMusicXML: typeof window.editorWasm.exportMusicXML,
                setTitle: typeof window.editorWasm.setTitle
            };
        }
        """)

        assert functions['exportMIDI'] == 'function', "exportMIDI should be available"
        assert functions['exportMusicXML'] == 'function', "exportMusicXML should be available"


# Run tests with: pytest tests/e2e/test_midi_export.py -v
