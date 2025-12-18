import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Multiple after-grace note groups position correctly', async ({ page }) => {
  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Grace]')) {
      logs.push(text);
    }
  });

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "12345 12345" - two beats, each with notes 1-5
  await page.keyboard.type('12345 12345');
  await page.waitForTimeout(100);

  // First group: Select "345" from first beat and make ornaments
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // past 1
  await page.keyboard.press('ArrowRight'); // past 2
  await page.keyboard.press('Shift+ArrowRight'); // select 3
  await page.keyboard.press('Shift+ArrowRight'); // select 4
  await page.keyboard.press('Shift+ArrowRight'); // select 5
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament
  await page.waitForTimeout(300);

  // Second group: Select "345" from second beat and make ornaments
  // Cursor should be after "5" now, need to move to second beat
  await page.keyboard.press('ArrowRight'); // past space
  await page.keyboard.press('ArrowRight'); // past 1
  await page.keyboard.press('ArrowRight'); // past 2
  await page.keyboard.press('Shift+ArrowRight'); // select 3
  await page.keyboard.press('Shift+ArrowRight'); // select 4
  await page.keyboard.press('Shift+ArrowRight'); // select 5
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament
  await page.waitForTimeout(500);

  // Wait for rendering
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/grace-multiple-groups.png', fullPage: true });

  // Print debug logs
  console.log('=== Grace Debug Logs ===');
  for (const log of logs) {
    console.log(log);
  }

  // Verify both groups were processed
  const transformLogs = logs.filter(log => log.includes('Set transform'));
  console.log('Transform logs count:', transformLogs.length);

  expect(transformLogs.length).toBeGreaterThanOrEqual(2);
});
