import { test, expect } from '@playwright/test';

test('Debug End key focus issue v2', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
    consoleLogs.push(`${msg.type()}: ${msg.text()}`);
  });

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
  console.log('\n=== CHECKING FOCUS BEFORE END ===');
  await page.evaluate(() => {
    const editor = document.getElementById('notation-editor');
    const active = document.activeElement;
    console.log('[BEFORE End] Active element:', active?.id || active?.tagName);
    console.log('[BEFORE End] Is editor focused?', active === editor);
  });
  await page.waitForTimeout(100);

  // Press End key
  console.log('\n=== PRESSING END KEY ===');
  await page.keyboard.press('End');
  await page.waitForTimeout(200);

  // Check focus after End press
  console.log('\n=== CHECKING FOCUS AFTER END ===');
  await page.evaluate(() => {
    const editor = document.getElementById('notation-editor');
    const active = document.activeElement;
    console.log('[AFTER End] Active element:', active?.id || active?.tagName);
    console.log('[AFTER End] Is editor focused?', active === editor);
  });
  await page.waitForTimeout(100);

  // Try typing just one character
  console.log('\n=== TYPING E ===');
  await page.keyboard.type('E');
  await page.waitForTimeout(300);

  // Check final state
  console.log('\n=== CHECKING FINAL STATE ===');
  const final = await page.evaluate(() => {
    const editor = document.getElementById('notation-editor');
    const active = document.activeElement;
    console.log('[FINAL] Active element:', active?.id || active?.tagName);
    const app = window.MusicNotationApp?.app();
    const content = app?.editor?.theDocument?.lines?.[0]?.cells?.map(c => c.char).join('') || '';
    console.log('[FINAL] Content:', content);
    return content;
  });

  console.log('Final content from test:', final);
  expect(final).toContain('E');
});
