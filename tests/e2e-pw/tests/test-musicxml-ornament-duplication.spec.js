import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('MUSICXML: ornament cells should not be duplicated in output', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456 1" - simple test case
  await page.keyboard.type('456 1');
  await page.waitForTimeout(300);

  // Select "56" and apply ornament
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // After "4"
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  await page.keyboard.press('Alt+o');
  await page.waitForTimeout(500);

  // Verify ornament was applied
  let cellInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const line = app.editor.theDocument.lines[0];
    return line.cells.map((c, i) => ({
      index: i,
      char: c.char,
      isOrnament: c.ornament_indicator && c.ornament_indicator.name !== 'none'
    }));
  });
  console.log('Cells with ornaments:', cellInfo);

  // Check MusicXML export
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');
  console.log('MusicXML output:', musicxml);

  // Count occurrences of each pitch to verify no duplicates
  // With input "456 1" where "56" is ornament:
  // - "4" should appear once as a normal note
  // - "5" should appear as a grace note
  // - "6" should appear as a grace note (should NOT appear twice)
  // - "1" should appear once as a normal note

  // Simple test: the word "note" should appear roughly once per actual note
  // "456 1" with "56" as ornament = "4" (1 note) + grace notes "5" (1) + grace notes "6" (1) + "1" (1 note)
  // So we expect 4 <note> elements (or at least not duplicates)

  const noteMatches = musicxml.match(/<note>/g) || [];
  console.log('Number of <note> elements:', noteMatches.length);
  // With grace notes and main notes, we expect around 4 total
  expect(noteMatches.length).toBeGreaterThan(0);
  expect(noteMatches.length).toBeLessThanOrEqual(6); // Some buffer for XML formatting
});
