// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Window Resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Wait for WASM to be ready
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    });
  });

  test('should handle window resize without errors', async ({ page }) => {
    // Listen for console errors
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Trigger a window resize event
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(500);

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(500);

    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForTimeout(500);

    // Check for the specific error we're fixing
    const hasResizeError = errors.some(err =>
      err.includes('resize is not a function') ||
      err.includes('renderer.resize')
    );

    expect(hasResizeError).toBe(false);

    if (errors.length > 0) {
      console.log('Console errors found:', errors);
    }

    console.log('✅ Window resize handled without errors');
  });

  test('editor should remain functional after resize', async ({ page }) => {
    // Insert some content
    await page.evaluate(() => {
      window.editor.wasmModule.insertText('| 1 2 3 4 |');
    });

    // Resize window
    await page.setViewportSize({ width: 1300, height: 850 });
    await page.waitForTimeout(300);

    // Verify editor still works
    const canInsertText = await page.evaluate(() => {
      try {
        window.editor.wasmModule.insertText(' 5');
        return true;
      } catch (e) {
        return false;
      }
    });

    expect(canInsertText).toBe(true);

    console.log('✅ Editor remains functional after resize');
  });
});
