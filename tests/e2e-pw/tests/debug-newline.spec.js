import { test, expect } from '@playwright/test';

/**
 * Debug test for newline handling
 */
test('Debug: Type, press Enter, check state', async ({ page }) => {
  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('ERROR') || text.includes('Failed') || text.includes('insertText') || text.includes('handleEnter') ||
        text.includes('renderDocument') || text.includes('⏱️') || text.includes('Measurement') || text.includes('Layout') ||
        text.includes('✨') || text.includes('📏') || text.includes('🚀')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  // Capture page errors
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  console.log('1. Editor visible, clicking...');
  await editor.click();

  console.log('2. Typing first line...');
  await page.keyboard.type('S r G');

  console.log('3. Waiting after first line...');
  await page.waitForTimeout(500);

  console.log('4. Pressing Enter...');
  await page.keyboard.press('Enter');

  console.log('5. Waiting after Enter...');
  await page.waitForTimeout(1000);

  // Check document state
  const docState = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    return {
      lineCount: doc?.lines?.length || 0,
      cursorLine: doc?.state?.cursor?.line,
      cursorCol: doc?.state?.cursor?.col,
      line0CellCount: doc?.lines?.[0]?.cells?.length || 0,
      line1CellCount: doc?.lines?.[1]?.cells?.length || 0
    };
  });

  console.log('6. Document state after Enter:', docState);

  expect(docState.lineCount, 'Should have 2 lines after Enter').toBe(2);

  console.log('7. Typing on second line...');
  try {
    await page.keyboard.type('P D n |', { timeout: 10000 });
    console.log('8. Typed full second line successfully');
  } catch (err) {
    console.error('9. Failed to type second line:', err.message);
    // Take screenshot
    await page.screenshot({ path: 'test-results/debug-newline-failure.png' });

    // Get final document state
    const finalState = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.theDocument;
      return {
        lineCount: doc?.lines?.length || 0,
        line1CellCount: doc?.lines?.[1]?.cells?.length || 0,
        line1Cells: doc?.lines?.[1]?.cells?.map(c => c.char).join('') || ''
      };
    });
    console.log('Final state:', finalState);

    throw err;
  }

  console.log('10. Test completed successfully!');
});
