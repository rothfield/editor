/**
 * E2E Test: MusicXML Import Verification
 *
 * Quick smoke test to verify MusicXML import functionality works end-to-end.
 * This test focuses on the import mechanism without UI navigation complexity.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test('SMOKE: MusicXML import works end-to-end', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Read test MusicXML file
  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/simple-melody.musicxml');
  const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

  console.log('[TEST] Testing MusicXML import with file size:', musicxmlContent.length, 'bytes');

  // Test import functionality
  const result = await page.evaluate(async (xml) => {
    try {
      // Step 1: Import MusicXML to Document
      const document = window.editor.wasmModule.importMusicXML(xml);

      console.log('[BROWSER] Import successful');
      console.log('[BROWSER] Document lines:', document.lines?.length || 0);

      // Step 2: Load into editor
      await window.editor.loadDocument(document);

      // Step 3: Export back to MusicXML (round-trip test)
      const exportedXML = window.editor.wasmModule.exportMusicXML();

      console.log('[BROWSER] Export successful');
      console.log('[BROWSER] Exported XML length:', exportedXML.length);

      return {
        success: true,
        importedLines: document.lines?.length || 0,
        exportedLength: exportedXML.length,
        exportContainsPitches: exportedXML.includes('<pitch>'),
      };
    } catch (error) {
      console.error('[BROWSER] Error:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }, musicxmlContent);

  console.log('[TEST] Result:', result);

  // Verify import succeeded
  expect(result.success).toBe(true);
  expect(result.importedLines).toBeGreaterThan(0);

  // Verify export works
  expect(result.exportedLength).toBeGreaterThan(0);
  expect(result.exportContainsPitches).toBe(true);

  // Verify editor shows content
  const editorContent = await editor.textContent();
  console.log('[TEST] Editor content length:', editorContent.length);
  expect(editorContent.length).toBeGreaterThan(0);

  await page.screenshot({ path: 'artifacts/musicxml-import-verification.png' });
});

test('import all test MusicXML files', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  const testFiles = [
    'simple-melody.musicxml',
    'accidentals.musicxml',
    'rests.musicxml',
  ];

  for (const filename of testFiles) {
    console.log(`[TEST] Testing import of ${filename}...`);

    const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml', filename);
    const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

    const result = await page.evaluate(async (xml) => {
      try {
        const document = window.editor.wasmModule.importMusicXML(xml);
        await window.editor.loadDocument(document);
        return { success: true, lines: document.lines?.length || 0 };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, musicxmlContent);

    console.log(`[TEST] ${filename} result:`, result);

    expect(result.success).toBe(true);
    expect(result.lines).toBeGreaterThan(0);
  }

  await page.screenshot({ path: 'artifacts/musicxml-import-all-files.png' });
});

test('verify imported pitches are correct', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Import simple melody (C D E F)
  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/simple-melody.musicxml');
  const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

  const result = await page.evaluate(async (xml) => {
    const document = window.editor.wasmModule.importMusicXML(xml);

    // Get pitch codes from first line
    const pitches = [];
    if (document.lines && document.lines[0] && document.lines[0].cells) {
      for (const cell of document.lines[0].cells) {
        if (cell.kind === 'PitchedElement' && cell.pitch_code) {
          pitches.push(cell.pitch_code);
        }
      }
    }

    await window.editor.loadDocument(document);

    return { pitches };
  }, musicxmlContent);

  console.log('[TEST] Imported pitches:', result.pitches);

  // C D E F should be N1, N2, N3, N4
  expect(result.pitches).toContain('N1'); // C
  expect(result.pitches).toContain('N2'); // D
  expect(result.pitches).toContain('N3'); // E
  expect(result.pitches).toContain('N4'); // F

  await page.screenshot({ path: 'artifacts/musicxml-import-pitches.png' });
});
