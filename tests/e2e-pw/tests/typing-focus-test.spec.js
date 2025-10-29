import { test, expect } from '@playwright/test';

test('Test if typing is blocked after switching tabs', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  console.log('\n=== TYPING BEFORE TAB SWITCH ===');
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(500);

  let docCheck1 = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log('[AFTER FIRST TYPE] cells:', cells, 'content:', content);
    return { cells, content };
  });
  console.log('After typing C-- D: cells =', docCheck1.cells, 'content:', docCheck1.content);

  // Now switch to lilypond and BACK
  console.log('\n=== SWITCHING TO LILYPOND ===');
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(500);

  console.log('=== BACK TO STAFF NOTATION ===');
  const staffNotationTab = page.locator('[data-tab="staff-notation"]');
  await staffNotationTab.click();
  await page.waitForTimeout(500);

  // Try typing again
  console.log('\n=== TYPING AFTER TAB SWITCH ===');
  await editor.click();
  await page.waitForTimeout(200);
  await editor.focus();
  await page.waitForTimeout(200);

  await page.keyboard.type(' E F');
  await page.waitForTimeout(500);

  let docCheck2 = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log('[AFTER SECOND TYPE] cells:', cells, 'content:', content);
    return { cells, content };
  });
  console.log('After typing after switch: cells =', docCheck2.cells, 'content:', docCheck2.content);

  // The second typing should have added " E F" to make "C-- D E F"
  expect(docCheck2.content).toContain('C-- D');
  expect(docCheck2.content).toContain('E');
  expect(docCheck2.content).toContain('F');
});
