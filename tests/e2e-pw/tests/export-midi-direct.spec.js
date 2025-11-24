/**
 * Test Direct IR-to-MIDI Export
 *
 * Verifies that the new direct IR-to-MIDI converter works end-to-end:
 * 1. Types a simple melody
 * 2. Opens export dialog
 * 3. Clicks MIDI export button (uses exportMIDIDirect())
 * 4. Verifies MIDI file is generated and downloaded
 */

import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Direct MIDI Export', () => {
  test('should export MIDI file using direct IR-to-MIDI converter', async ({ editorPage: page }) => {
    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type a simple melody: 1 2 3 | 4 5 6 7 |
    await editor.click();
    await page.keyboard.type('1 2 3 | 4 5 6 7 |');

    // Wait for rendering to stabilize
    await page.waitForTimeout(500);

    // Set up download listener before clicking export
    const downloadPromise = page.waitForEvent('download');

    // Open export dialog
    const exportButton = page.locator('button:has-text("Export")');
    await exportButton.click();

    // Wait for modal to appear
    const exportModal = page.locator('[data-export="midi"]');
    await expect(exportModal).toBeVisible();

    // Click MIDI export button
    await exportModal.click();

    // Wait for download to complete
    const download = await downloadPromise;

    // Verify download filename
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.mid$/);

    // Verify file has content (MIDI header is typically ~50-100 bytes minimum)
    const downloadPath = await download.path();
    const fs = require('fs');
    const fileContent = fs.readFileSync(downloadPath);

    // Check MIDI file header (should start with "MThd")
    expect(fileContent.toString('ascii', 0, 4)).toBe('MThd');

    // Check file size is reasonable (at least 100 bytes for a small melody)
    expect(fileContent.length).toBeGreaterThan(100);

    console.log(`✓ MIDI file exported: ${filename} (${fileContent.length} bytes)`);
  });

  test('should call exportMIDIDirect WASM function directly', async ({ editorPage: page }) => {
    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type a simple sequence
    await editor.click();
    await page.keyboard.type('1 2 3 4');

    // Wait for WASM to process
    await page.waitForTimeout(300);

    // Call exportMIDIDirect directly via browser console
    const result = await page.evaluate(async () => {
      if (!window.editor || !window.editor.wasmModule) {
        throw new Error('Editor or WASM not initialized');
      }

      if (!window.editor.wasmModule.exportMIDIDirect) {
        throw new Error('exportMIDIDirect not available on WASM module');
      }

      // Call the function
      const midiData = window.editor.wasmModule.exportMIDIDirect(480, 120.0);

      return {
        success: true,
        dataLength: midiData.length,
        dataType: Object.prototype.toString.call(midiData),
        // Check MIDI header (first 4 bytes should be "MThd")
        header: String.fromCharCode(midiData[0], midiData[1], midiData[2], midiData[3]),
      };
    });

    // Verify the export succeeded
    expect(result.success).toBe(true);
    expect(result.dataType).toBe('[object Uint8Array]');
    expect(result.header).toBe('MThd');
    expect(result.dataLength).toBeGreaterThan(50);

    console.log(`✓ Direct WASM call succeeded: ${result.dataLength} bytes, header=${result.header}`);
  });

  test('should export MIDI faster than legacy MusicXML path (benchmark)', async ({ editorPage: page }) => {
    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type a larger sequence for meaningful benchmark
    await editor.click();
    await page.keyboard.type('1 2 3 4 5 6 7 | 1 2 3 4 5 6 7 | 1 2 3 4 5 6 7 |');

    // Wait for WASM to process
    await page.waitForTimeout(500);

    // Benchmark: Direct IR-to-MIDI export
    const directTiming = await page.evaluate(async () => {
      const iterations = 10;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        window.editor.wasmModule.exportMIDIDirect(480, 120.0);
        const end = performance.now();
        times.push(end - start);
      }

      return {
        min: Math.min(...times),
        max: Math.max(...times),
        avg: times.reduce((a, b) => a + b, 0) / times.length,
      };
    });

    // Benchmark: Legacy MusicXML-based export
    const legacyTiming = await page.evaluate(async () => {
      if (!window.editor.wasmModule.exportMIDI) {
        return null; // Legacy function not available
      }

      const iterations = 10;
      const times = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        window.editor.wasmModule.exportMIDI(480);
        const end = performance.now();
        times.push(end - start);
      }

      return {
        min: Math.min(...times),
        max: Math.max(...times),
        avg: times.reduce((a, b) => a + b, 0) / times.length,
      };
    });

    console.log('Performance Comparison:');
    console.log(`  Direct IR-to-MIDI: ${directTiming.avg.toFixed(2)}ms avg (${directTiming.min.toFixed(2)}ms - ${directTiming.max.toFixed(2)}ms)`);

    if (legacyTiming) {
      console.log(`  Legacy MusicXML:   ${legacyTiming.avg.toFixed(2)}ms avg (${legacyTiming.min.toFixed(2)}ms - ${legacyTiming.max.toFixed(2)}ms)`);
      const speedup = legacyTiming.avg / directTiming.avg;
      console.log(`  Speedup: ${speedup.toFixed(2)}x faster`);

      // Expect at least 1.5x speedup (conservative estimate, should be 2-5x)
      expect(speedup).toBeGreaterThan(1.5);
    } else {
      console.log('  Legacy MusicXML: Not available (function removed or renamed)');
    }

    // Verify direct export is reasonably fast (< 50ms for small sequence)
    expect(directTiming.avg).toBeLessThan(50);
  });
});
