import { test, expect } from '@playwright/test';

test('Typing after End key press', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial content
  await editor.click();
  await page.keyboard.type('C D');
  await page.waitForTimeout(500);

  // Switch tabs
  await page.getByTestId('tab-lilypond').click();
  await page.waitForTimeout(300);
  await page.locator('[data-tab="staff-notation"]').click();
  await page.waitForTimeout(500);

  // Now try with End key like the failing test
  console.log('Clicking editor and pressing End');
  await editor.click();
  await page.waitForTimeout(200);

  // Press End key to go to end of line
  await page.keyboard.press('End');
  await page.waitForTimeout(200);

  const docBeforeTyping = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log(`[Before typing with End] cells: ${cells}, content: '${content}'`);
    return { cells, content };
  });
  console.log('Before typing (after End press):', docBeforeTyping);

  // Try typing
  await page.keyboard.type(' E F');
  await page.waitForTimeout(500);

  const docAfterTyping = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log(`[After typing] cells: ${cells}, content: '${content}'`);
    return { cells, content };
  });
  console.log('After typing E F:', docAfterTyping);

  // Should have added the characters
  expect(docAfterTyping.content).toContain('E');
  expect(docAfterTyping.content).toContain('F');
});
