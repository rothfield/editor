import { test, expect } from '@playwright/test';

test('Simple End key debug - show all logs', async ({ page }) => {
  // Collect ALL console logs
  page.on('console', msg => {
    const text = msg.text();
    // Only print debug logs
    if (text.includes('[') && text.includes(']')) {
      console.log(text);
    }
  });

  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial
  await editor.click();
  await page.keyboard.type('C D');
  await page.waitForTimeout(500);

  console.log('===== BEFORE TAB SWITCH =====');

  // Switch and back
  await page.getByTestId('tab-lilypond').click();
  await page.waitForTimeout(300);
  await page.locator('[data-tab="staff-notation"]').click();
  await page.waitForTimeout(500);

  // Click editor
  await editor.click();
  await page.waitForTimeout(200);

  console.log('===== ABOUT TO PRESS END =====');

  // Press End
  await page.keyboard.press('End');

  // Wait for logs to be captured
  await page.waitForTimeout(1000);

  console.log('===== AFTER END PRESS COMPLETE =====');
});
