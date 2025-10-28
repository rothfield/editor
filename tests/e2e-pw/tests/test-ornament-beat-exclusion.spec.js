import { test, expect } from '@playwright/test';

test('ornament: ornament cells excluded from beat calculations', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456" - should create 3 beats normally
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Check beats before ornament
  let beatsInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const line = app.editor.theDocument.lines[0];
    return {
      cellCount: line.cells.length,
      beatCount: line.beats.length,
      beats: line.beats.map((b, i) => ({
        index: i,
        start: b.start,
        end: b.end
      }))
    };
  });
  console.log('Beats before ornament:', beatsInfo);
  expect(beatsInfo.cellCount).toBe(3);
  expect(beatsInfo.beatCount).toBe(1); // 3 consecutive cells = 1 beat group

  // Select "56" and apply ornament
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  await page.keyboard.press('Alt+o');
  await page.waitForTimeout(500);

  // Check beats after ornament - should still have same beats (ornaments excluded)
  beatsInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const line = app.editor.theDocument.lines[0];
    return {
      cellCount: line.cells.length,
      beatCount: line.beats.length,
      beats: line.beats.map((b, i) => ({
        index: i,
        start: b.start,
        end: b.end
      })),
      cellOrnaments: line.cells.map((c, i) => ({
        index: i,
        char: c.char,
        hasOrnament: c.ornament_indicator && c.ornament_indicator.name !== 'none'
      }))
    };
  });
  console.log('Beats after ornament:', beatsInfo);
  expect(beatsInfo.cellCount).toBe(3); // Still 3 cells
  expect(beatsInfo.beatCount).toBe(1); // Only "4" contributes to beats (cells "5" and "6" are ornaments)
  // Beat should still span from start to end of all cells in the original group
  // but calculated only on non-ornament cells
  console.log('Final beat:', beatsInfo.beats[0]);
});
