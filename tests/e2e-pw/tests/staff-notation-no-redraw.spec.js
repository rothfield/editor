import { test, expect } from '@playwright/test';

test('Staff notation should redraw when switching back to tab with new content', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial notation and render it
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(500);

  // Get initial HTML snapshot
  const staffNotationContainer = page.locator('#staff-notation-container');
  const initialHtml = await staffNotationContainer.innerHTML();
  console.log('Initial SVG length:', initialHtml.length);

  // Switch to another tab (lilypond)
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(300);

  // Switch back to staff notation tab
  const staffNotationTab = page.locator('[data-tab="staff-notation"]');
  await staffNotationTab.click();
  await page.waitForTimeout(500);

  // Now type MORE content on the staff notation tab
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' E F G');
  await page.waitForTimeout(1000);

  // Check what theDocument contains after typing
  const docAfterTyping = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    return {
      firstLineCells: doc.lines?.[0]?.cells?.length || 0,
      cellsPreview: doc.lines?.[0]?.cells?.map(c => c.char).join('') || 'NONE'
    };
  });
  console.log('After typing: cells =', docAfterTyping.firstLineCells, 'content:', docAfterTyping.cellsPreview);

  // Get the HTML after typing new content
  const updatedHtml = await staffNotationContainer.innerHTML();
  console.log('Updated SVG length:', updatedHtml.length);

  // EXPECTED: The SVG should be different (showing more notes)
  expect(updatedHtml).not.toEqual(initialHtml);
  expect(docAfterTyping.cellsPreview).toContain('E');
  expect(docAfterTyping.cellsPreview).toContain('F');
  expect(docAfterTyping.cellsPreview).toContain('G');
});
