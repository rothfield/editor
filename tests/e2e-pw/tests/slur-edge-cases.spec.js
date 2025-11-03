/**
 * E2E Tests: Slur Edge Cases
 * Verifies slur application handles edge cases correctly
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getDocumentModel } from '../helpers/inspectors.js';

test.describe('Slur Edge Cases', () => {
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

  test('Single note selection - should not apply slur (needs 2+ notes)', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type one note
    await page.keyboard.type('1');
    await page.waitForTimeout(200);

    // Select the single note
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');

    // Try to apply slur
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Verify no slur was applied
    const doc = await getDocumentModel(page);
    const cells = doc.lines[0].cells;
    const slurCells = cells.filter(c =>
      c.slur_indicator && c.slur_indicator.name && c.slur_indicator.name !== 'none'
    );

    expect(slurCells.length).toBe(0);
    console.log('✅ Single note correctly rejected (no slur applied)');
  });

  test('Two note slur - minimum valid selection', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type two notes
    await page.keyboard.type('1 2');
    await page.waitForTimeout(200);

    // Select both notes
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) {  // 1, space, 2
      await page.keyboard.press('Shift+ArrowRight');
    }

    // Apply slur
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Verify slur was applied
    const doc = await getDocumentModel(page);
    const cells = doc.lines[0].cells;
    const slurCells = cells.filter(c =>
      c.slur_indicator && c.slur_indicator.name && c.slur_indicator.name !== 'none'
    );

    expect(slurCells.length).toBeGreaterThanOrEqual(2);
    console.log('✅ Two note slur correctly applied');
  });

  test('Toggle slur - apply then remove', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type three notes
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(200);

    // Select all notes
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {  // 1, space, 2, space, 3
      await page.keyboard.press('Shift+ArrowRight');
    }

    // Apply slur
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Verify slur exists
    let doc = await getDocumentModel(page);
    let cells = doc.lines[0].cells;
    let slurCells = cells.filter(c =>
      c.slur_indicator && c.slur_indicator.name && c.slur_indicator.name !== 'none'
    );
    expect(slurCells.length).toBeGreaterThan(0);
    console.log('✅ Slur applied');

    // Select again and toggle off
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Verify slur removed
    doc = await getDocumentModel(page);
    cells = doc.lines[0].cells;
    slurCells = cells.filter(c =>
      c.slur_indicator && c.slur_indicator.name && c.slur_indicator.name !== 'none'
    );
    expect(slurCells.length).toBe(0);
    console.log('✅ Slur removed on toggle');
  });

  test('Multiple slurs on same line', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type notes: 1 2 | 3 4
    await page.keyboard.type('1 2 | 3 4');
    await page.waitForTimeout(300);

    // Select first two notes (1 2)
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) {  // 1, space, 2
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Move to second pair and select (3 4)
    await page.keyboard.press('End');
    for (let i = 0; i < 3; i++) {  // Back 3 chars: 4, space, 3
      await page.keyboard.press('Shift+ArrowLeft');
    }
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Check MusicXML for multiple slur elements
    await openTab(page, 'tab-musicxml');
    const musicxmlText = await readPaneText(page, 'pane-musicxml');

    // Count slur start elements
    const slurMatches = musicxmlText.match(/<slur type="start"/g);
    expect(slurMatches).not.toBeNull();
    expect(slurMatches.length).toBeGreaterThanOrEqual(2);
    console.log(`✅ Found ${slurMatches.length} separate slurs`);
  });
});
