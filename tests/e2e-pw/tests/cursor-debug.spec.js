/**
 * Debug test - capture console errors when typing
 */

import { test, expect } from '@playwright/test';

test('Debug: capture console logs when typing', async ({ page }) => {
  const logs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
  });

  page.on('pageerror', err => {
    errors.push(err.message);
  });

  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type a single character
  await editor.type('1');

  // Wait for processing
  await page.waitForTimeout(500);

  // Output logs
  console.log('\n=== CONSOLE LOGS ===');
  logs.forEach(log => console.log(log));

  console.log('\n=== PAGE ERRORS ===');
  if (errors.length > 0) {
    errors.forEach(err => console.log(err));
  } else {
    console.log('No page errors');
  }

  // Check if any WASM errors
  const wasmErrors = logs.filter(log => log.includes('[WASM]') && log.includes('error'));
  if (wasmErrors.length > 0) {
    console.log('\n=== WASM ERRORS ===');
    wasmErrors.forEach(err => console.log(err));
  }

  // This test always passes - it's just for debugging
  expect(true).toBe(true);
});
