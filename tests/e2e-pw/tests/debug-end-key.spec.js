import { test, expect } from '@playwright/test';

test('Debug End key focus issue', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial content
  await editor.click();
  await page.keyboard.type('C D');
  await page.waitForTimeout(500);

  // Switch tabs and back
  await page.getByTestId('tab-lilypond').click();
  await page.waitForTimeout(300);
  await page.locator('[data-tab="staff-notation"]').click();
  await page.waitForTimeout(500);

  // Click and focus editor
  await editor.click();
  await page.waitForTimeout(200);

  // Check focus before End press
  await page.evaluate(() => {
    const editor = document.getElementById('notation-editor');
    const active = document.activeElement;
    console.log('[BEFORE End] Active element:', active?.id || active?.tagName);
    console.log('[BEFORE End] Is editor focused?', active === editor);
    console.log('[BEFORE End] Is editor or child?', editor?.contains(active));
  });

  // Press End key
  console.log('Pressing End key...');
  await page.keyboard.press('End');
  await page.waitForTimeout(200);

  // Check focus after End press
  await page.evaluate(() => {
    const editor = document.getElementById('notation-editor');
    const active = document.activeElement;
    console.log('[AFTER End] Active element:', active?.id || active?.tagName);
    console.log('[AFTER End] Is editor focused?', active === editor);
    console.log('[AFTER End] Is editor or child?', editor?.contains(active));
  });

  // Try typing just one character
  console.log('Typing E...');
  await page.keyboard.type('E');
  await page.waitForTimeout(300);

  // Check final state
  await page.evaluate(() => {
    const editor = document.getElementById('notation-editor');
    const active = document.activeElement;
    console.log('[AFTER type] Active element:', active?.id || active?.tagName);
    const app = window.MusicNotationApp?.app();
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log('[AFTER type] Content:', content);
  });

  const final = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    return content;
  });

  expect(final).toContain('E');
});
