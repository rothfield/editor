import { test, expect } from '@playwright/test';

test('verify font widths with fresh browser context', async ({ browser }) => {
  // Create a fresh context with no storage
  const context = await browser.newContext({
    storageState: undefined  // No cookies/storage
  });

  const page = await context.newPage();

  // Navigate
  await page.goto('http://localhost:8080');

  // Wait for fonts to load
  await page.waitForFunction(() => document.fonts.ready);
  await page.waitForTimeout(2000);

  // Capture console
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  // Reload to trigger measurement
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Print debug logs
  const debugLogs = logs.filter(log => log.includes('[DEBUG]'));
  console.log('\n=== Fresh Context Measurements ===');
  debugLogs.forEach(log => console.log(log));
  console.log('==================================\n');

  await context.close();
});
