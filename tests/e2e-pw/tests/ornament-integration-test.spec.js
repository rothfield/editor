/**
 * Comprehensive integration test for ornament system
 * Tests the complete workflow: input → annotation layer → sync → export
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Ornament System Integration', () => {
  test('complete ornament workflow: apply → sync → export → verify', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // 1. Type musical content
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    // 2. Apply ornaments to multiple positions
    const applyResults = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const results = [];

      // Ornament on first note (before)
      results.push(editor.wasmModule.applyOrnamentLayered(0, 0, '5 6', 'before'));

      // Ornament on third note (after)
      results.push(editor.wasmModule.applyOrnamentLayered(0, 4, '7', 'after'));

      return results;
    });

    console.log('Apply results:', applyResults);
    expect(applyResults[0].success).toBe(true);
    expect(applyResults[1].success).toBe(true);

    // 3. Verify ornaments stored in annotation layer
    const annotationLayerOrnaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return [
        editor.wasmModule.getOrnamentAt(0, 0),
        editor.wasmModule.getOrnamentAt(0, 4)
      ];
    });

    console.log('Annotation layer ornaments:', annotationLayerOrnaments);
    expect(annotationLayerOrnaments[0].notation).toBe('5 6');
    expect(annotationLayerOrnaments[0].placement).toBe('before');
    expect(annotationLayerOrnaments[1].notation).toBe('7');
    expect(annotationLayerOrnaments[1].placement).toBe('after');

    // 4. Trigger sync to cells
    const syncResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    console.log('Sync result:', syncResult);
    expect(syncResult.success).toBe(true);
    expect(syncResult.ornaments_applied).toBe(2);

    // 5. Verify cells have ornament data
    const cellsWithOrnaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      const line = doc.lines[0];

      return line.cells
        .filter(c => c.ornament !== null && c.ornament !== undefined)
        .map(c => ({
          col: c.col,
          char: c.char,
          ornamentCells: c.ornament.cells.map(oc => oc.char),
          placement: c.ornament.placement
        }));
    });

    console.log('Cells with ornaments:', cellsWithOrnaments);
    expect(cellsWithOrnaments.length).toBe(2);

    // First ornament should have cells ["5", " ", "6"]
    expect(cellsWithOrnaments[0].ornamentCells).toEqual(['5', ' ', '6']);

    // Second ornament should have cells ["7"]
    expect(cellsWithOrnaments[1].ornamentCells).toEqual(['7']);

    // 6. Trigger export to MusicXML
    await openTab(page, 'tab-musicxml');
    const musicXML = await readPaneText(page, 'pane-musicxml');

    console.log('MusicXML export length:', musicXML.length);
    expect(musicXML.length).toBeGreaterThan(0);
    expect(musicXML).toContain('<?xml');
    expect(musicXML).toContain('<score-partwise');

    // 7. Verify LilyPond export also works
    await openTab(page, 'tab-lilypond');
    const lilypond = await readPaneText(page, 'pane-lilypond');

    console.log('LilyPond export length:', lilypond.length);
    expect(lilypond.length).toBeGreaterThan(0);
    expect(lilypond).toContain('\\version');

    console.log('✅ Complete ornament integration test passed!');
  });

  test('ornament persistence across edits', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type and apply ornament
    await page.keyboard.type('1 2 3');
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'after');
    });

    // Verify ornament exists
    let ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });
    expect(ornament.notation).toBe('4 5');

    // Insert text at end (should not affect ornament position)
    await page.keyboard.press('End');
    await page.keyboard.type(' 6');
    await page.waitForTimeout(300);

    // Ornament should still be at position 0
    ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });
    expect(ornament.notation).toBe('4 5');

    console.log('✅ Ornament persisted across text insertion');
  });

  test('copy ornament and paste to multiple positions', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type notes
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    // Apply ornament to first note
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '6 7 8', 'before');
    });

    // Sync to cells for copying
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyAnnotationOrnamentsToCells();
    });

    // Copy ornament from first note
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // cursor at col 1
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      return app.editor.ui.copyOrnament();
    });

    // Verify clipboard
    const clipboardText = await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      return app.editor.clipboard.ornamentNotation;
    });
    expect(clipboardText).toBe('6 7 8');

    // Paste to second note (col 2)
    await page.keyboard.press('ArrowRight'); // col 2
    await page.keyboard.press('ArrowRight'); // col 3
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(300);

    // Paste to fourth note (col 6)
    await page.keyboard.press('ArrowRight'); // col 4
    await page.keyboard.press('ArrowRight'); // col 5
    await page.keyboard.press('ArrowRight'); // col 6
    await page.keyboard.press('ArrowRight'); // col 7
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(300);

    // Verify all three ornaments exist
    const allOrnaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentsForLine(0);
    });

    console.log('All ornaments:', allOrnaments);
    expect(allOrnaments.length).toBe(3);
    expect(allOrnaments.every(o => o.notation === '6 7 8')).toBe(true);

    console.log('✅ Copy-paste to multiple positions works');
  });
});
