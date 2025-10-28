import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Ornament after: F with GA melisma then C', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "F GA C" pattern - F (main), GA (after ornament), C (next main)
  // Using numbers: 1 23 4 (where 1=F, 2=G, 3=A, 4=C)
  await page.keyboard.type('1 23 4');
  await page.waitForTimeout(300);

  // Select "23" (the ornament cells) - indices 2-3
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // After "1"
  await page.keyboard.press('ArrowRight'); // After space
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  // Apply ornament with position "after"
  await page.keyboard.press('Alt+o');
  await page.waitForTimeout(500);

  // Verify ornament was applied
  let cellInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const line = app.editor.theDocument.lines[0];
    return {
      cells: line.cells.map((c, i) => ({
        index: i,
        char: c.char,
        isOrnament: c.ornament_indicator && c.ornament_indicator.name !== 'none'
      })),
      beats: line.beats.map((b, i) => ({
        index: i,
        start: b.start,
        end: b.end
      }))
    };
  });
  console.log('Cells:', cellInfo.cells);
  console.log('Beats:', cellInfo.beats);

  // Check MusicXML export
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');
  console.log('MusicXML output:\n', musicxml);

  // Verify structure:
  // - Main note 1 (F) should appear as regular note
  // - Notes 2, 3 (GA) should appear as grace notes with steal-time-previous
  // - Note 4 (C) should appear as regular note
  // - Total: 4 notes (1 main + 2 grace + 1 main)

  const noteMatches = musicxml.match(/<note>/g) || [];
  console.log(`Total <note> elements: ${noteMatches.length}`);

  const graceMatches = musicxml.match(/<grace/g) || [];
  console.log(`Grace notes: ${graceMatches.length}`);

  const stealPreviousMatches = musicxml.match(/steal-time-previous/g) || [];
  console.log(`steal-time-previous occurrences: ${stealPreviousMatches.length}`);

  // Expect 2 grace notes (GA) with steal-time-previous
  expect(graceMatches.length).toBe(2);
  expect(stealPreviousMatches.length).toBe(2);

  // Expect 4 total notes
  expect(noteMatches.length).toBe(4);
});
