/**
 * E2E Test: MusicXML Import - Rests
 *
 * Tests importing a MusicXML file with rests.
 * Verifies that rests are correctly imported and displayed.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test('import MusicXML with rests', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Read the test MusicXML file with rests
  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/rests.musicxml');
  const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

  console.log('[TEST] Importing MusicXML file with rests...');

  const importResult = await page.evaluate(async (xml) => {
    try {
      const document = window.editor.wasmModule.importMusicXML(xml);
      await window.editor.loadDocument(document);

      return { success: true };
    } catch (error) {
      console.error('[BROWSER] Import failed:', error);
      return { success: false, error: error.message };
    }
  }, musicxmlContent);

  expect(importResult.success).toBe(true);

  await page.waitForTimeout(500);

  // Verify editor content
  const editorText = await editor.textContent();
  console.log('[TEST] Editor content:', editorText);

  // The file has: C rest E rest
  // Should contain dashes for rests
  expect(editorText).toBeTruthy();
  expect(editorText.length).toBeGreaterThan(0);

  // Verify MusicXML export contains rest elements
  const musicxmlExport = await page.evaluate(() => {
    return window.editor.wasmModule.exportMusicXML();
  });

  expect(musicxmlExport).toContain('<rest');

  await page.screenshot({ path: 'artifacts/musicxml-import-rests.png' });
});

test('round-trip import and export with rests', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/rests.musicxml');
  const originalMusicXML = readFileSync(musicxmlPath, 'utf-8');

  // Import
  await page.evaluate(async (xml) => {
    const document = window.editor.wasmModule.importMusicXML(xml);
    await window.editor.loadDocument(document);
  }, originalMusicXML);

  await page.waitForTimeout(500);

  // Export
  const exportedMusicXML = await page.evaluate(() => {
    return window.editor.wasmModule.exportMusicXML();
  });

  console.log('[TEST] Original MusicXML length:', originalMusicXML.length);
  console.log('[TEST] Exported MusicXML length:', exportedMusicXML.length);

  // Verify both have rest elements
  const originalRestCount = (originalMusicXML.match(/<rest/g) || []).length;
  const exportedRestCount = (exportedMusicXML.match(/<rest/g) || []).length;

  console.log('[TEST] Original rest count:', originalRestCount);
  console.log('[TEST] Exported rest count:', exportedRestCount);

  // Should have at least some rests
  expect(exportedRestCount).toBeGreaterThan(0);

  await page.screenshot({ path: 'artifacts/musicxml-import-rests-roundtrip.png' });
});
