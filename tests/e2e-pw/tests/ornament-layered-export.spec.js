/**
 * Test ornament export with layered annotation architecture
 * Verifies ornaments sync to cells and export correctly
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Layered Ornament Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('should export ornaments to MusicXML', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament to first note with notation "4 5"
    const applyResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'after');
    });

    console.log('Apply ornament result:', applyResult);
    expect(applyResult.success).toBe(true);

    // Wait for rendering to complete
    await page.waitForTimeout(500);

    // Open MusicXML tab to trigger export
    await openTab(page, 'tab-musicxml');
    const musicXML = await readPaneText(page, 'pane-musicxml');

    console.log('MusicXML length:', musicXML.length);
    expect(musicXML.length).toBeGreaterThan(0);

    // Basic structure check
    expect(musicXML).toContain('<?xml');
    expect(musicXML).toContain('<score-partwise');

    console.log('✅ MusicXML export with ornaments completed');
  });

  test('should sync ornaments to cells before export', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'before');
    });

    // Trigger sync explicitly
    const syncResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    console.log('Sync result:', syncResult);
    expect(syncResult.success).toBe(true);
    expect(syncResult.ornaments_applied).toBeGreaterThan(0);

    // Verify cells have ornament data
    const doc = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getDocumentSnapshot();
    });

    console.log('Document lines:', doc.lines.length);
    expect(doc.lines.length).toBeGreaterThan(0);

    const firstLine = doc.lines[0];
    console.log('First line cells:', firstLine.cells.length);
    expect(firstLine.cells.length).toBeGreaterThan(0);

    // Find cell with ornament
    const cellsWithOrnaments = firstLine.cells.filter(c => c.ornament !== null && c.ornament !== undefined);
    console.log('Cells with ornaments:', cellsWithOrnaments.length);
    expect(cellsWithOrnaments.length).toBeGreaterThan(0);

    const ornamentCell = cellsWithOrnaments[0];
    console.log('Ornament cell:', ornamentCell.ornament);
    expect(ornamentCell.ornament).toBeDefined();
    expect(ornamentCell.ornament.cells).toBeDefined();
    expect(ornamentCell.ornament.cells.length).toBeGreaterThan(0);

    console.log('✅ Ornaments synced to cells correctly');
  });

  test('should handle multiple ornaments on same line', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2 3 4"
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    // Apply ornaments to multiple positions
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      editor.wasmModule.applyOrnamentLayered(0, 0, '5 6', 'after');
      editor.wasmModule.applyOrnamentLayered(0, 2, '7', 'before');
    });

    // Get all ornaments for line
    const ornaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentsForLine(0);
    });

    console.log('Ornaments on line:', ornaments);
    expect(ornaments.length).toBe(2);
    expect(ornaments[0].notation).toBe('5 6');
    expect(ornaments[1].notation).toBe('7');

    // Sync and verify
    const syncResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    expect(syncResult.success).toBe(true);
    expect(syncResult.ornaments_applied).toBe(2);

    console.log('✅ Multiple ornaments handled correctly');
  });

  test('should preserve ornament placement (before/after)', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type "1 2"
    await page.keyboard.type('1 2');
    await page.waitForTimeout(500);

    // Apply ornament with "before" placement
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '3 4', 'before');
    });

    // Get ornament and verify placement
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    expect(ornament.placement).toBe('before');

    // Apply another with "after" placement
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 2, '5', 'after');
    });

    const ornament2 = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 2);
    });

    expect(ornament2.placement).toBe('after');

    console.log('✅ Ornament placement preserved correctly');
  });
});
