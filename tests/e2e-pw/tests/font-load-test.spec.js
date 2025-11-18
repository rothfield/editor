import { test, expect } from '@playwright/test';

test('NotationFont loads without timeout', async ({ page }) => {
  const consoleMessages = [];
  const errors = [];

  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(text);
    if (text.includes('ERROR') || text.includes('error')) {
      errors.push(text);
    }
  });

  // Navigate to editor
  await page.goto('http://localhost:8080');

  // Wait for editor to initialize
  await page.waitForSelector('#editor', { state: 'visible', timeout: 10000 });

  // Check console logs for font loading
  const fontLoadMessages = consoleMessages.filter(msg =>
    msg.includes('NotationFont') || msg.includes('font')
  );

  console.log('\n=== Font Loading Messages ===');
  fontLoadMessages.forEach(msg => console.log(msg));

  // CRITICAL: Check for timeout warning (should NOT exist)
  const hasTimeout = consoleMessages.some(msg =>
    msg.includes('NotationFont load timeout')
  );

  expect(hasTimeout).toBe(false);
  console.log('✓ No font load timeout warning');

  // NOTE: System-specific font loading is currently disabled.
  // Full NotationFont is loaded via @font-face in index.html.
  // The following check is commented out:
  /*
  const hasSuccess = consoleMessages.some(msg =>
    msg.includes('NotationFont-Number') && msg.includes('loaded successfully')
  );
  expect(hasSuccess).toBe(true);
  console.log('✓ NotationFont-Number loaded successfully');
  */

  // Verify no errors
  expect(errors).toHaveLength(0);
  console.log('✓ No console errors');

  // Type some text to verify font renders
  const editor = page.locator('#editor');
  await editor.click();
  await page.keyboard.type('1 2 3');

  // Wait a bit for rendering
  await page.waitForTimeout(500);

  // Take screenshot for visual verification
  await page.screenshot({ path: '/tmp/font-test-number.png' });
  console.log('✓ Screenshot saved: /tmp/font-test-number.png');
});
