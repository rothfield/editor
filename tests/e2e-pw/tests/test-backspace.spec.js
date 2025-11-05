import { test, expect } from '@playwright/test';

/**
 * Test backspace functionality - verify characters are actually deleted
 */
test('Backspace: Type 123 then delete with backspace', async ({ page }) => {
  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ERROR') || text.includes('Failed') || text.includes('delete') || text.includes('WASM')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  console.log('1. Clicking editor...');
  await editor.click();

  console.log('2. Typing "123"...');
  await page.keyboard.type('123');

  await page.waitForTimeout(300);

  // Check document state after typing
  const stateAfterTyping = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      cellCount: cells.length,
      chars: cells.map(c => c.char).join(''),
      cursorCol: doc?.state?.cursor?.col
    };
  });

  console.log('3. State after typing "123":', stateAfterTyping);
  expect(stateAfterTyping.chars).toBe('123');
  expect(stateAfterTyping.cellCount).toBe(3);
  expect(stateAfterTyping.cursorCol).toBe(3);

  console.log('4. Pressing Backspace...');
  await page.keyboard.press('Backspace');

  await page.waitForTimeout(300);

  // Check document state after backspace
  const stateAfterBackspace = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      cellCount: cells.length,
      chars: cells.map(c => c.char).join(''),
      cursorCol: doc?.state?.cursor?.col
    };
  });

  console.log('5. State after Backspace:', stateAfterBackspace);

  // Verify backspace deleted the last character
  expect(stateAfterBackspace.chars).toBe('12');
  expect(stateAfterBackspace.cellCount).toBe(2);
  expect(stateAfterBackspace.cursorCol).toBe(2);

  console.log('6. Pressing Backspace again...');
  await page.keyboard.press('Backspace');

  await page.waitForTimeout(300);

  const stateAfterSecondBackspace = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      cellCount: cells.length,
      chars: cells.map(c => c.char).join(''),
      cursorCol: doc?.state?.cursor?.col
    };
  });

  console.log('7. State after second Backspace:', stateAfterSecondBackspace);

  // Verify second backspace deleted another character
  expect(stateAfterSecondBackspace.chars).toBe('1');
  expect(stateAfterSecondBackspace.cellCount).toBe(1);
  expect(stateAfterSecondBackspace.cursorCol).toBe(1);

  console.log('8. Pressing Backspace one more time...');
  await page.keyboard.press('Backspace');

  await page.waitForTimeout(300);

  const stateAfterThirdBackspace = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    const cells = doc?.lines?.[0]?.cells || [];
    return {
      cellCount: cells.length,
      chars: cells.map(c => c.char).join(''),
      cursorCol: doc?.state?.cursor?.col
    };
  });

  console.log('9. State after third Backspace:', stateAfterThirdBackspace);

  // Verify all characters deleted
  expect(stateAfterThirdBackspace.chars).toBe('');
  expect(stateAfterThirdBackspace.cellCount).toBe(0);
  expect(stateAfterThirdBackspace.cursorCol).toBe(0);

  console.log('✅ Backspace test completed - all deletions worked correctly!');
});
