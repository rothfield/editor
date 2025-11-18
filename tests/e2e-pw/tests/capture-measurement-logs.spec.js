import { test } from '@playwright/test';
import { waitForEditorReady } from '../utils/editor.helpers.js';

test('capture measurement service debug logs', async ({ page }) => {
  const logs = [];

  // Capture all console messages
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  await page.goto('/');
  await page.waitForTimeout(3000); // Wait for full initialization

  // Print all captured logs
  console.log('\n=== Browser Console Logs ===');
  logs.forEach(log => console.log(log));
  console.log('============================\n');

  // Look for DEBUG lines
  const debugLogs = logs.filter(log => log.includes('[DEBUG]'));
  console.log('\n=== Measurement Debug Lines ===');
  debugLogs.forEach(log => console.log(log));
  console.log('================================\n');
});
