import { test, expect } from '@playwright/test';

test('Simple typing after tab switch', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial content
  await editor.click();
  await page.keyboard.type('C D');
  await page.waitForTimeout(500);

  const docBefore = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    return { cells, content };
  });
  console.log('Before tab switch:', docBefore);

  // Switch to lilypond tab
  await page.getByTestId('tab-lilypond').click();
  await page.waitForTimeout(300);

  // Switch back to staff notation
  await page.locator('[data-tab="staff-notation"]').click();
  await page.waitForTimeout(500);

  const docAfterSwitch = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log(`[JS after switch] cells: ${cells}, content: '${content}'`);
    return { cells, content };
  });
  console.log('After tab switch (before typing):', docAfterSwitch);
  expect(docAfterSwitch.content).toEqual(docBefore.content);

  // Now try typing - simple case with just letter
  console.log('About to type E');
  await editor.click();
  await page.waitForTimeout(200);

  // Check if editor has focus
  const hasFocus = await page.evaluate(() => {
    const editor = document.getElementById('notation-editor');
    console.log('Editor element:', editor);
    console.log('Active element:', document.activeElement?.id || document.activeElement?.tagName);
    console.log('Is editor focused?', document.activeElement === editor);
    return document.activeElement === editor;
  });
  console.log('Editor has focus?', hasFocus);

  // Try typing just one letter
  await page.keyboard.type('E');
  await page.waitForTimeout(500);

  const docAfterTyping = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log(`[JS after typing] cells: ${cells}, content: '${content}'`);
    return { cells, content };
  });
  console.log('After typing E:', docAfterTyping);

  // Should have added E
  expect(docAfterTyping.content).toContain('E');
});
