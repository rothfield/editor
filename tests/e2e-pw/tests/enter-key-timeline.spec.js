/**
 * Debug Enter key - capture timeline of cursor changes
 */

import { test, expect } from '@playwright/test';

test('Enter key timeline - track all cursor updates', async ({ page }) => {
  const timeline = [];

  page.on('console', msg => {
    const text = msg.text();
    // Capture anything related to cursor
    if (text.includes('Cursor') || text.includes('cursor') || text.includes('handleEnter') || text.includes('insertNewline')) {
      timeline.push({
        time: new Date().toISOString(),
        message: text
      });
    }
  });

  await page.goto('/');
  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type text
  await editor.type('12');
  await page.waitForTimeout(200);

  // Clear timeline
  timeline.length = 0;

  // Press Enter
  console.log('\n=== PRESSING ENTER ===');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Print timeline
  console.log('\n=== TIMELINE ===');
  timeline.forEach((entry, i) => {
    console.log(`${i + 1}. ${entry.message}`);
  });

  // Check final cursor position
  const cursorPosition = page.locator('#cursor-position');
  const cursorText = await cursorPosition.textContent();
  console.log('\n=== FINAL STATE ===');
  console.log('Cursor HUD:', cursorText);

  // Always pass
  expect(true).toBe(true);
});
