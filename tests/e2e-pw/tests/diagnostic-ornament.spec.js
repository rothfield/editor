/**
 * Diagnostic test for ornament keyboard shortcut
 */

import { test, expect } from '@playwright/test';

test('Diagnostic: Check if Alt+0 reaches the editor', async ({ page }) => {
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`${msg.type()}: ${msg.text()}`);
  });

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type some content
  await page.keyboard.type('2 3 4');
  await page.waitForTimeout(300);

  // Select all
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  await page.waitForTimeout(200);

  console.log('About to press Alt+0');

  // Try pressing Alt+0
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(1000);

  // Print all console logs
  console.log('=== Console logs ===');
  consoleLogs.forEach(log => console.log(log));

  // Check if applyOrnament was called
  const applyOrnamentLogs = consoleLogs.filter(log =>
    log.includes('applyOrnament') || log.includes('Alt command') || log.includes('ornament')
  );

  console.log('=== Ornament-related logs ===');
  applyOrnamentLogs.forEach(log => console.log(log));

  // Check document state
  const doc = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return {
      hasApp: !!app,
      hasEditor: !!app?.editor,
      hasDocument: !!app?.editor?.theDocument,
      hasWasmModule: !!app?.editor?.wasmModule,
      hasApplyOrnamentMethod: typeof app?.editor?.applyOrnament === 'function',
      hasApplyOrnamentWasm: typeof app?.editor?.wasmModule?.applyOrnament === 'function'
    };
  });

  console.log('=== Document state ===', JSON.stringify(doc, null, 2));

  expect(applyOrnamentLogs.length).toBeGreaterThan(0);
});
