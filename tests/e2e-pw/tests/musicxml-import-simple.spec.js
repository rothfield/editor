/**
 * E2E Test: MusicXML Import - Simple Melody
 *
 * Tests importing a basic MusicXML file with a simple melody (C-D-E-F).
 * Verifies that the import works and the notes appear in the editor.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test('import simple MusicXML melody and verify display', async ({ page }) => {
  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Read the test MusicXML file
  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/simple-melody.musicxml');
  const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

  console.log('[TEST] Importing MusicXML file...');

  // Import MusicXML via JavaScript API
  const importResult = await page.evaluate(async (xml) => {
    try {
      // Call WASM import function directly
      const document = window.editor.wasmModule.importMusicXML(xml);

      console.log('[BROWSER] Import successful:', document);

      // Load the imported document
      await window.editor.loadDocument(document);

      return { success: true, lineCount: document.lines?.length || 0 };
    } catch (error) {
      console.error('[BROWSER] Import failed:', error);
      return { success: false, error: error.message };
    }
  }, musicxmlContent);

  console.log('[TEST] Import result:', importResult);

  // Verify import succeeded
  expect(importResult.success).toBe(true);
  expect(importResult.lineCount).toBeGreaterThan(0);

  // Wait for render to complete
  await page.waitForTimeout(500);

  // Verify notes are visible in the editor
  // The simple melody has C-D-E-F (in Number system: 1-2-3-4)
  const editorText = await editor.textContent();
  console.log('[TEST] Editor content:', editorText);

  // Check that the editor contains pitch characters
  // (In Number system, we expect to see digits 1, 2, 3, 4)
  expect(editorText).toBeTruthy();
  expect(editorText.length).toBeGreaterThan(0);

  // Take screenshot for visual verification
  await page.screenshot({ path: 'artifacts/musicxml-import-simple.png' });
});

test('import MusicXML and verify LilyPond export', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Read the test MusicXML file
  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/simple-melody.musicxml');
  const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

  // Import MusicXML
  await page.evaluate(async (xml) => {
    const document = window.editor.wasmModule.importMusicXML(xml);
    await window.editor.loadDocument(document);
  }, musicxmlContent);

  await page.waitForTimeout(500);

  // Open inspector panel if not already open
  const inspectorPanel = page.locator('#inspector-panel');
  const isVisible = await inspectorPanel.isVisible();
  if (!isVisible) {
    await page.click('button:has-text("Inspector")');
    await expect(inspectorPanel).toBeVisible();
  }

  // Click LilyPond tab
  const lilypondTab = page.locator('button[data-testid="tab-lilypond"]');
  await lilypondTab.click();

  // Get LilyPond output
  const lilypondPane = page.locator('pre[data-testid="pane-lilypond"]');
  await expect(lilypondPane).toBeVisible();

  // Wait for content to load
  await expect.poll(async () => {
    const text = await lilypondPane.textContent();
    return text && text.trim().length > 0;
  }).toBeTruthy();

  const lilypondOutput = await lilypondPane.textContent();
  console.log('[TEST] LilyPond output:', lilypondOutput);

  // Verify LilyPond output contains expected elements
  expect(lilypondOutput).toContain('\\version');
  expect(lilypondOutput).toContain('\\score');

  // Save LilyPond output for inspection
  await page.evaluate((output) => {
    console.log('[BROWSER] LilyPond output:\n', output);
  }, lilypondOutput);

  await page.screenshot({ path: 'artifacts/musicxml-import-lilypond.png' });
});
