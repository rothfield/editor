import { test, expect } from '@playwright/test';

test('Test insertText directly after End key', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[insertText]') || text.includes('After pressing End')) {
      console.log(text);
    }
  });

  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial content
  await editor.click();
  await page.keyboard.type('C D');
  await page.waitForTimeout(500);

  // Get initial doc state
  const docBefore = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    const cursorPos = app?.editor?.theDocument?.state?.cursor?.char_pos || 0;
    return { cells, content, cursorPos };
  });
  console.log('Initial doc:', docBefore);

  // Switch tabs and back
  await page.getByTestId('tab-lilypond').click();
  await page.waitForTimeout(300);
  await page.locator('[data-tab="staff-notation"]').click();
  await page.waitForTimeout(500);

  // Click editor and focus
  await editor.click();
  await page.waitForTimeout(200);

  // Press End key
  console.log('Pressing End key...');
  await page.keyboard.press('End');
  await page.waitForTimeout(300);

  // Check cursor position after End
  const docAfterEnd = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    const cursorPos = app?.editor?.theDocument?.state?.cursor?.char_pos || 0;
    console.log(`After pressing End: cells=${cells}, content='${content}', cursorPos=${cursorPos}`);
    return { cells, content, cursorPos };
  });

  // Now try calling insertText directly from JavaScript
  console.log('\nCalling insertText directly...');
  const docAfterInsert = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    console.log('Before insertText: calling...');
    try {
      app.editor.insertText('E');
      const cells = app?.editor?.theDocument?.lines?.[0]?.cells?.length || 0;
      const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
      console.log(`After insertText('E'): cells=${cells}, content='${content}'`);
      return { cells, content };
    } catch (e) {
      console.error('Error calling insertText:', e);
      throw e;
    }
  });

  expect(docAfterInsert.content).toContain('E');
});
