import { test, expect } from '@playwright/test';

test.describe('Set Composer Functionality', () => {
  test('UI.setComposer() should set composer correctly', async ({ page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    // Type some content
    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Call UI.setComposer() with a mocked prompt
    const result = await page.evaluate(() => {
      return new Promise(async (resolve) => {
        try {
          // Mock the prompt to avoid browser dialog
          const originalPrompt = window.prompt;
          window.prompt = () => 'Test Composer Via UI';

          // Call UI setComposer
          await window.editor.ui.setComposer();

          // Restore prompt
          window.prompt = originalPrompt;

          // Check if composer was set
          const doc = window.editor.getDocument();

          resolve({
            composer: doc.composer,
            success: true
          });
        } catch (e) {
          window.prompt = originalPrompt;
          resolve({
            error: e.message,
            stack: e.stack,
            success: false
          });
        }
      });
    });

    console.log('UI.setComposer() result:', result);

    // Verify no console errors
    expect(consoleErrors.length).toBe(
      0,
      `Unexpected console errors: ${consoleErrors.join('; ')}`
    );

    // Verify composer was set successfully
    expect(result.success).toBe(true);
    expect(result.composer).toBe('Test Composer Via UI');
  });

  test('WASM setComposer works correctly', async ({ page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    // Type some content
    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Call setComposer via WASM directly
    const result = await page.evaluate(() => {
      return new Promise(async (resolve) => {
        try {
          const before = window.editor.getDocument().composer;
          window.editor.wasmModule.setComposer('Direct WASM Composer');
          const after = window.editor.getDocument().composer;

          resolve({
            before,
            after,
            success: true
          });
        } catch (e) {
          resolve({
            error: e.message,
            success: false
          });
        }
      });
    });

    // WASM call works fine
    expect(result.success).toBe(true);
    expect(result.after).toBe('Direct WASM Composer');
    expect(consoleErrors.length).toBe(0);
  });

  test('Composer persists in document model and display', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    // Type some content
    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Set composer via WASM
    await page.evaluate(() => {
      window.editor.wasmModule.setComposer('Persistent Composer');
    });

    // Check document model
    const docModel = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return {
        composer: doc.composer
      };
    });

    expect(docModel.composer).toBe('Persistent Composer');

    // Re-render and verify it persists
    await page.evaluate(() => window.editor.render());

    const postRenderModel = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return {
        composer: doc.composer
      };
    });

    expect(postRenderModel.composer).toBe('Persistent Composer');
  });
});
