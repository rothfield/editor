import { test, expect } from '@playwright/test';

test('Debug End key with logging', async ({ page }) => {
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial
  await editor.click();
  await page.keyboard.type('C D');
  await page.waitForTimeout(500);

  // Switch and back
  await page.getByTestId('tab-lilypond').click();
  await page.waitForTimeout(300);
  await page.locator('[data-tab="staff-notation"]').click();
  await page.waitForTimeout(500);

  // Click editor
  await editor.click();
  await page.waitForTimeout(200);

  // Log before pressing End
  const beforeEndLogs = consoleLogs.length;

  // Press End
  console.log('=== About to press End ===');
  await page.keyboard.press('End');
  await page.waitForTimeout(300);

  // Look for cursor updates in logs
  const logsAfterEnd = consoleLogs.slice(beforeEndLogs);
  const cursorLogs = logsAfterEnd.filter(log =>
    log.includes('cursor') || log.includes('Navigate') || log.includes('position') || log.includes('setCursorPosition')
  );

  console.log('=== Logs after End key ===');
  cursorLogs.forEach(log => console.log(log));

  // Now check state
  const state = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const cursorPos = app?.editor?.theDocument?.state?.cursor?.col || 0;
    const maxPos = app?.editor?.getMaxCharPosition?.() || 'N/A';
    console.log(`[JS] cursor.col=${cursorPos}, getMaxCharPosition()=${maxPos}`);
    return { cursorPos, maxPos };
  });

  console.log('Cursor position after End:', state.cursorPos);
  console.log('Max position:', state.maxPos);
});
