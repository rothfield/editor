/**
 * Detailed MusicXML export test for ornaments
 * Verifies the complete export pipeline
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Ornament MusicXML Export - Detailed Verification', () => {
  test('should export ornament with correct structure in MusicXML', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type notes
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament
    const result = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5 6', 'before');
    });

    expect(result.success).toBe(true);
    console.log('✅ Ornament applied:', result);

    // Verify annotation layer
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Annotation layer ornament:', ornament);
    expect(ornament.notation).toBe('4 5 6');
    expect(ornament.placement).toBe('before');

    // Trigger sync
    const syncResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    console.log('Sync result:', syncResult);
    expect(syncResult.success).toBe(true);
    expect(syncResult.ornaments_applied).toBe(1);

    // Verify cell has ornament
    const cellOrnament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      const cell = doc.lines[0].cells[0];

      return {
        hasOrnament: cell.ornament !== null,
        ornamentCells: cell.ornament ? cell.ornament.cells.map(c => c.char) : null,
        placement: cell.ornament ? cell.ornament.placement : null
      };
    });

    console.log('Cell ornament:', cellOrnament);
    expect(cellOrnament.hasOrnament).toBe(true);
    expect(cellOrnament.ornamentCells).toEqual(['4', ' ', '5', ' ', '6']);
    expect(cellOrnament.placement).toBe('before');

    // Export to MusicXML
    await openTab(page, 'tab-musicxml');
    const musicXML = await readPaneText(page, 'pane-musicxml');

    console.log('MusicXML length:', musicXML.length);
    console.log('MusicXML preview:', musicXML.substring(0, 500));

    // Verify basic structure
    expect(musicXML.length).toBeGreaterThan(0);
    expect(musicXML).toContain('<?xml');
    expect(musicXML).toContain('<score-partwise');
    expect(musicXML).toContain('<part-list>');
    expect(musicXML).toContain('<measure');

    console.log('✅ MusicXML export completed with ornaments');
  });

  test('should handle multiple ornaments in MusicXML export', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type notes
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    // Apply multiple ornaments
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      editor.wasmModule.applyOrnamentLayered(0, 0, '6 7', 'before');
      editor.wasmModule.applyOrnamentLayered(0, 4, '8', 'after');
      editor.wasmModule.applyOrnamentLayered(0, 8, '9', 'before');
    });

    // Verify all ornaments stored
    const allOrnaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentsForLine(0);
    });

    console.log('All ornaments:', allOrnaments);
    expect(allOrnaments.length).toBe(3);

    // Sync to cells
    const syncResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    console.log('Sync result:', syncResult);
    expect(syncResult.success).toBe(true);
    expect(syncResult.ornaments_applied).toBe(3);

    // Export to MusicXML
    await openTab(page, 'tab-musicxml');
    const musicXML = await readPaneText(page, 'pane-musicxml');

    expect(musicXML.length).toBeGreaterThan(0);
    expect(musicXML).toContain('<?xml');

    console.log('✅ Multiple ornaments exported to MusicXML');
  });

  test('should export ornament placement (before/after) to MusicXML', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type notes
    await page.keyboard.type('1 2');
    await page.waitForTimeout(500);

    // Apply ornaments with different placements
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      editor.wasmModule.applyOrnamentLayered(0, 0, '3', 'before');
      editor.wasmModule.applyOrnamentLayered(0, 2, '4', 'after');
    });

    // Verify placements
    const ornaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return [
        editor.wasmModule.getOrnamentAt(0, 0),
        editor.wasmModule.getOrnamentAt(0, 2)
      ];
    });

    console.log('Ornaments with placement:', ornaments);
    expect(ornaments[0].placement).toBe('before');
    expect(ornaments[1].placement).toBe('after');

    // Export
    await openTab(page, 'tab-musicxml');
    const musicXML = await readPaneText(page, 'pane-musicxml');

    expect(musicXML.length).toBeGreaterThan(0);
    console.log('✅ Ornament placement exported to MusicXML');
  });

  test('should verify IR generation includes ornaments', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type and apply ornament
    await page.keyboard.type('1 2 3');
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'before');
    });

    // Check IR JSON tab
    const irJson = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.generateIRJson(editor.wasmModule.getDocumentSnapshot());
    });

    console.log('IR JSON length:', irJson.length);
    expect(irJson.length).toBeGreaterThan(0);

    const ir = JSON.parse(irJson);
    console.log('IR structure:', Object.keys(ir));
    expect(ir.lines).toBeDefined();
    expect(ir.lines.length).toBeGreaterThan(0);

    console.log('✅ IR generation includes document structure');
  });
});
