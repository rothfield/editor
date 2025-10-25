// Debug test to see why ornament dialog doesn't open

import { test, expect } from '@playwright/test';

test('debug ornament menu click', async ({ page }) => {
  // Listen for console messages
  const consoleLogs = [];
  const consoleErrors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  await page.goto('http://localhost:8080');
  await page.waitForSelector('#notation-editor', { state: 'visible' });
  await page.waitForTimeout(2000); // Wait for WASM

  // Type notes
  await page.click('#notation-editor');
  await page.keyboard.type('srgm');
  await page.waitForTimeout(500);

  // Move to first note
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);

  console.log('Before menu click - console logs:', consoleLogs.slice(-5));
  console.log('Before menu click - console errors:', consoleErrors);

  // Click Edit menu
  await page.click('#edit-menu-button');
  await page.waitForTimeout(500);

  console.log('After menu button click - console logs:', consoleLogs.slice(-5));

  // Click Ornament menu item
  await page.click('#menu-ornament');
  await page.waitForTimeout(1000);

  console.log('After ornament click - console logs:', consoleLogs.slice(-10));
  console.log('After ornament click - console errors:', consoleErrors);

  // Check if ornamentEditor exists in window
  const hasOrnamentEditor = await page.evaluate(() => {
    return window.musicEditor && window.musicEditor.ornamentEditor !== null;
  });

  console.log('window.musicEditor.ornamentEditor exists?', hasOrnamentEditor);

  // Try to get any error from showing
  const errorDisplay = await page.locator('#console-log').textContent({timeout: 1000}).catch(() => 'NO CONSOLE LOG ELEMENT');
  console.log('Console log element content:', errorDisplay);
});
