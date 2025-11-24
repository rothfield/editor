/**
 * E2E Test: MusicXML Import - Accidentals
 *
 * Tests importing a MusicXML file with accidentals (sharps and flats).
 * Verifies that accidentals are correctly imported and displayed.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test('import MusicXML with accidentals', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Read the test MusicXML file with accidentals
  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/accidentals.musicxml');
  const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

  console.log('[TEST] Importing MusicXML file with accidentals...');

  // Import MusicXML
  const importResult = await page.evaluate(async (xml) => {
    try {
      const document = window.editor.wasmModule.importMusicXML(xml);
      await window.editor.loadDocument(document);

      return { success: true, document };
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

  // The file has: C# Db E F#
  // In Number system: 1# 2b 3 4#
  expect(editorText).toBeTruthy();

  // Verify MusicXML export contains accidentals
  const musicxmlExport = await page.evaluate(() => {
    return window.editor.wasmModule.exportMusicXML();
  });

  console.log('[TEST] Exported MusicXML length:', musicxmlExport.length);

  // Check for alter elements (accidentals)
  expect(musicxmlExport).toContain('<alter>1</alter>'); // Sharp
  expect(musicxmlExport).toContain('<alter>-1</alter>'); // Flat

  await page.screenshot({ path: 'artifacts/musicxml-import-accidentals.png' });
});

test('import MusicXML accidentals and verify in inspector', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  const musicxmlPath = join(process.cwd(), 'tests/fixtures/musicxml/accidentals.musicxml');
  const musicxmlContent = readFileSync(musicxmlPath, 'utf-8');

  await page.evaluate(async (xml) => {
    const document = window.editor.wasmModule.importMusicXML(xml);
    await window.editor.loadDocument(document);
  }, musicxmlContent);

  await page.waitForTimeout(500);

  // Open inspector and check MusicXML tab
  const inspectorPanel = page.locator('#inspector-panel');
  const isVisible = await inspectorPanel.isVisible();
  if (!isVisible) {
    await page.click('button:has-text("Inspector")');
    await expect(inspectorPanel).toBeVisible();
  }

  const musicxmlTab = page.locator('button[data-testid="tab-musicxml"]');
  await musicxmlTab.click();

  const musicxmlPane = page.locator('pre[data-testid="pane-musicxml"]');
  await expect(musicxmlPane).toBeVisible();

  await expect.poll(async () => {
    const text = await musicxmlPane.textContent();
    return text && text.trim().length > 0;
  }).toBeTruthy();

  const musicxmlOutput = await musicxmlPane.textContent();

  // Verify accidentals are preserved in round-trip
  expect(musicxmlOutput).toContain('<alter>1</alter>');
  expect(musicxmlOutput).toContain('<alter>-1</alter>');

  await page.screenshot({ path: 'artifacts/musicxml-import-accidentals-inspector.png' });
});
