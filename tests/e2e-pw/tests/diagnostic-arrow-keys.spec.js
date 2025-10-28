import { test, expect } from '@playwright/test';

test('diagnostic: arrow key navigation works', async ({ page }) => {
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    if (msg.text().includes('[getNavigableStops]')) {
      consoleLogs.push(msg.text());
    }
  });

  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type content: "Hello"
  await page.keyboard.type('Hello');

  // Move cursor left with arrow keys
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);

  // Insert 'X' at cursor position (should be before 'o')
  await page.keyboard.type('X');

  // Check that we have "HellXo"
  const doc = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return app.editor.theDocument.lines[0].cells.map(c => c.char).join('');
  });

  console.log(`Document content: "${doc}"`);
  console.log('\n=== CAPTURED CONSOLE LOGS ===');
  consoleLogs.forEach(log => console.log(log));
  console.log('=== END CONSOLE LOGS ===\n');

  // Should be "HellXo" if arrow left worked
  expect(doc).toBe('HellXo');
});
