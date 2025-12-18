/**
 * E2E Test: Slur export to IR/MusicXML
 *
 * Bug: slurSelection updates cell.char but NOT cell.codepoint.
 * IR builder uses cell.is_slur_start() which checks cell.codepoint.slur_left()
 * → slurs never appear in IR/MusicXML export.
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Slur IR/MusicXML export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Clear any existing content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('slur appears in MusicXML export', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(100);

    // Verify slur exists in document (via getSlursForLine)
    const slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    console.log('Slurs in document:', JSON.stringify(slurs));
    expect(slurs.length).toBe(1);

    // Open MusicXML tab
    await openTab(page, 'tab-musicxml');

    // Get MusicXML content
    const musicxmlText = await readPaneText(page, 'pane-musicxml');
    console.log('MusicXML output:', musicxmlText);

    // Slur should appear in MusicXML
    // Expected: <slur type="start" number="1"/> on first note
    // Expected: <slur type="stop" number="1"/> on second note
    expect(musicxmlText).toContain('<slur');
    expect(musicxmlText).toContain('type="start"');
    expect(musicxmlText).toContain('type="stop"');
  });

  test('slur appears in LilyPond export', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(100);

    // Open LilyPond tab
    await openTab(page, 'tab-lilypond');

    // Get LilyPond content
    const lilypondText = await readPaneText(page, 'pane-lilypond');
    console.log('LilyPond output:', lilypondText);

    // Slur should appear in LilyPond as ( and )
    // Expected: c4( d4) or similar with slur markers
    expect(lilypondText).toMatch(/\(/);  // slur start
    expect(lilypondText).toMatch(/\)/);  // slur end
  });

  test('three-note slur has start, continue, stop markers', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "123" (single beat = triplet)
    await page.keyboard.type('123');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(100);

    // Open MusicXML tab
    await openTab(page, 'tab-musicxml');

    // Get MusicXML content
    const musicxmlText = await readPaneText(page, 'pane-musicxml');
    console.log('MusicXML for 3-note slur:', musicxmlText);

    // Should have slur elements (not tuplet elements!)
    // <slur type="start" number="1"/>
    // <slur type="stop" number="1"/>
    expect(musicxmlText).toContain('<slur');
    expect(musicxmlText).toMatch(/<slur[^>]*type="start"/);
    expect(musicxmlText).toMatch(/<slur[^>]*type="stop"/);
  });
});
