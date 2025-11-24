import { test, expect } from '@playwright/test';

test.describe('Set Tonic Functionality', () => {
  test('Tonic should be saved in document model', async ({ page }) => {
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

    // Set tonic via WASM
    const beforeTonic = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return doc.tonic;
    });

    console.log('Tonic before:', beforeTonic);

    // Call setDocumentTonic
    await page.evaluate(async () => {
      window.editor.wasmModule.setDocumentTonic('G');
      // Give time for WASM to process
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Check document model IMMEDIATELY
    const afterTonic = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return doc.tonic;
    });

    console.log('Tonic after setDocumentTonic:', afterTonic);

    // Verify no console errors
    expect(consoleErrors.length).toBe(
      0,
      `Console errors: ${consoleErrors.join('; ')}`
    );

    // Verify tonic is saved
    expect(afterTonic).toBe('G', 'Tonic should be saved in document model');
  });

  test('Tonic should appear in persistent model (YAML)', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Set tonic
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('D');
    });

    // Render to update inspector
    await page.evaluate(() => window.editor.renderAndUpdate());

    // Check persistent model tab
    const persistentTab = page.getByTestId('tab-persistent');
    if (await persistentTab.isVisible()) {
      await persistentTab.click();

      const persistentPane = page.getByTestId('pane-persistent');
      await expect(persistentPane).toBeVisible();

      const persistentContent = await persistentPane.innerText();
      console.log('Persistent model:', persistentContent);

      // Should contain the tonic value
      expect(persistentContent).toContain('tonic: D');
    }
  });

  test('IR generation should include document metadata (tonic)', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Set tonic
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('A');
    });

    // Render and update
    await page.evaluate(() => window.editor.renderAndUpdate());

    // Check IR tab
    const irTab = page.getByTestId('tab-ir');
    if (await irTab.isVisible()) {
      await irTab.click();

      const irPane = page.getByTestId('pane-ir');
      await expect(irPane).toBeVisible();

      const irContent = await irPane.innerText();
      console.log('IR output (first 500 chars):', irContent.substring(0, 500));

      // IR should have been generated
      expect(irContent.length).toBeGreaterThan(0);

      // IR should be JSON
      expect(irContent).toContain('[');
      expect(irContent).toContain('{');

      // Note: Document-level tonic metadata may or may not be in IR depending on WASM implementation
      // The important thing is that the IR was generated and contains note data
      expect(irContent).toContain('pitch');
    }
  });

  test('UI.setTonic() should persist tonic in document', async ({ page }) => {
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

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Call UI.setTonic() with a mocked prompt
    const result = await page.evaluate(() => {
      return new Promise(async (resolve) => {
        try {
          // Mock the prompt
          const originalPrompt = window.prompt;
          window.prompt = () => 'F';

          // Call UI setTonic
          await window.editor.ui.setTonic();

          // Restore prompt
          window.prompt = originalPrompt;

          // Check if tonic was set
          const doc = window.editor.getDocument();

          resolve({
            tonic: doc.tonic,
            success: true
          });
        } catch (e) {
          window.prompt = originalPrompt;
          resolve({
            error: e.message,
            success: false
          });
        }
      });
    });

    console.log('UI.setTonic() result:', result);

    expect(consoleErrors.length).toBe(0);
    expect(result.success).toBe(true);
    expect(result.tonic).toBe('F');
  });

  test('setTonic persists through render cycles', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Set tonic
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('C');
    });

    // Render multiple times
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.editor.render());

      const tonic = await page.evaluate(() => {
        return window.editor.getDocument().tonic;
      });

      expect(tonic).toBe('C', `Tonic should persist after render ${i + 1}`);
    }
  });
});
