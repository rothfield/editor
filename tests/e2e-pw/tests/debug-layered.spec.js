import { test, expect } from '@playwright/test';

test('debug layered slur - check window.editor state', async ({ page }) => {
  // Enable console logging
  page.on('console', msg => console.log('[BROWSER]', msg.text()));
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  await page.goto('/');

  // Wait for editor element
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Check what's available on window
  const windowState = await page.evaluate(() => {
    return {
      hasEditor: typeof window.editor !== 'undefined',
      editorKeys: window.editor ? Object.keys(window.editor) : [],
      hasWasmModule: window.editor && typeof window.editor.wasmModule !== 'undefined',
      wasmModuleKeys: window.editor && window.editor.wasmModule ?
        Object.keys(window.editor.wasmModule).filter(k => k.includes('slur') || k.includes('Slur')) :
        [],
    };
  });

  console.log('Window state:', JSON.stringify(windowState, null, 2));

  expect(windowState.hasEditor).toBe(true);
});
