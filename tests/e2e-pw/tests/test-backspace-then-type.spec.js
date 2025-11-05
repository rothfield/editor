import { test, expect } from '@playwright/test';

/**
 * Test the specific case: 12<backspace>3 should result in 13
 */
test('Type 12, backspace, type 3 → should result in 13', async ({ page }) => {
  // Capture all console messages
  page.on('console', msg => {
    console.log(`[BROWSER] ${msg.text()}`);
  });

  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "12"
  await page.keyboard.type('12');
  await page.waitForTimeout(100);

  // Verify we have "12"
  const stateAfter12 = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      chars: cells.map(c => c.char).join(''),
      cursorCol: doc?.state?.cursor?.col
    };
  });

  expect(stateAfter12.chars).toBe('12');
  expect(stateAfter12.cursorCol).toBe(2);

  // Press Backspace
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  // Verify we now have "1"
  const stateAfterBackspace = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      chars: cells.map(c => c.char).join(''),
      cursorCol: doc?.state?.cursor?.col
    };
  });

  expect(stateAfterBackspace.chars).toBe('1');
  expect(stateAfterBackspace.cursorCol).toBe(1);

  // Type "3"
  await page.keyboard.type('3');
  await page.waitForTimeout(100);

  // Verify final result is "13"
  const finalState = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      chars: cells.map(c => c.char).join(''),
      cursorCol: doc?.state?.cursor?.col
    };
  });

  expect(finalState.chars).toBe('13');
  expect(finalState.cursorCol).toBe(2);
});
