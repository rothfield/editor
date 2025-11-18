import { test, expect } from '@playwright/test';

test('Capture render logs to diagnose spacing issue', async ({ page }) => {
  const logs = [];

  // Capture all console logs
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
  });

  await page.goto('http://localhost:8080');

  // Wait for editor to be ready using data-testid
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Wait for initial render logs
  await page.waitForTimeout(2000);

  // Type some characters to trigger renders
  await editor.click();
  await page.keyboard.type('1234');

  // Wait for logs
  await page.waitForTimeout(1000);

  // Type more to trigger a second render
  await page.keyboard.type('567');

  await page.waitForTimeout(1000);

  // Filter and print render/measure logs
  const renderLogs = logs.filter(log =>
    log.includes('[RENDER]') || log.includes('[MEASURE]')
  );

  console.log('\n=== RENDER/MEASURE LOGS ===');
  renderLogs.forEach(log => console.log(log));
  console.log('=== END LOGS ===\n');
  console.log(`Total logs captured: ${renderLogs.length}`);

  // Save all logs to file for inspection
  const fs = require('fs');
  fs.writeFileSync('/tmp/all-logs.txt', logs.join('\n'));
  fs.writeFileSync('/tmp/render-logs.txt', renderLogs.join('\n'));
  console.log('All logs saved to /tmp/all-logs.txt');
  console.log('Render logs saved to /tmp/render-logs.txt');
});
