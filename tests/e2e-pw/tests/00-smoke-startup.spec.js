import { test, expect } from '@playwright/test';

test('SMOKE TEST: Application starts without console errors', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  // Capture console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Capture uncaught exceptions
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  // Navigate to app
  await page.goto('/');

  // Wait for WASM module to load and initialize
  await page.waitForFunction(
    () => typeof window.editor !== 'undefined',
    { timeout: 15000 }
  );

  // Give a moment for any deferred errors to surface
  await page.waitForTimeout(1000);

  // Assert no console errors
  expect(consoleErrors).toEqual(
    [],
    `Console errors detected during startup: ${consoleErrors.join('; ')}`
  );

  // Assert no uncaught exceptions
  expect(pageErrors).toEqual(
    [],
    `Uncaught exceptions during startup: ${pageErrors.join('; ')}`
  );

  // Verify editor is initialized
  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 5000 });

  // Verify WASM module is accessible
  const wasmReady = await page.evaluate(() => {
    return typeof window.editor?.wasmModule !== 'undefined' &&
           typeof window.editor?.wasmModule?.getDocumentSnapshot === 'function';
  });
  expect(wasmReady).toBe(true, 'WASM module not properly initialized');
});
