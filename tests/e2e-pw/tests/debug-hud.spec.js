import { test, expect } from '@playwright/test';

test.describe('Debug HUD (Cursor/Selection State)', () => {
  test('should display cursor state when toggled with Ctrl+Shift+D', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Focus the editor
    await editor.click();

    // Toggle debug HUD with keyboard shortcut
    await page.keyboard.press('Control+Shift+D');

    // Wait for HUD to appear
    const hud = page.locator('#debug-hud');
    await expect(hud).toBeVisible({ timeout: 5000 });

    // Check that HUD contains cursor information
    await expect(hud).toContainText('Cursor/Selection State');
    await expect(hud).toContainText('Caret:');
    await expect(hud).toContainText('DesiredCol:');

    // Initial cursor should be at (0, 0)
    await expect(hud).toContainText('Caret: (0, 0)');

    // Toggle HUD off
    await page.keyboard.press('Control+Shift+D');

    // HUD should disappear
    await expect(hud).not.toBeVisible();
  });

  test('WASM functions should be accessible and callable', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test that WASM functions are exposed and callable
    const result = await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      const editor = app?.editor;

      if (!editor || !editor.wasmModule) {
        throw new Error('Editor or WASM module not found');
      }

      // Check that all new functions exist
      const funcs = [
        'getCaretInfo',
        'getSelectionInfo',
        'setSelection',
        'clearSelection',
        'startSelection',
        'extendSelection'
      ];

      const missing = [];
      for (const func of funcs) {
        if (typeof editor.wasmModule[func] !== 'function') {
          missing.push(func);
        }
      }

      if (missing.length > 0) {
        throw new Error(`Missing WASM functions: ${missing.join(', ')}`);
      }

      // Call getCaretInfo and return result
      const caretInfo = editor.wasmModule.getCaretInfo();
      const selectionInfo = editor.wasmModule.getSelectionInfo();

      return {
        caretInfo,
        selectionInfo,
        functionsExist: true
      };
    });

    // Verify functions are accessible
    expect(result.functionsExist).toBe(true);

    // Verify caretInfo structure
    expect(result.caretInfo).toBeDefined();
    expect(result.caretInfo.caret).toBeDefined();
    expect(result.caretInfo.caret.stave).toBe(0);
    expect(result.caretInfo.caret.col).toBeGreaterThanOrEqual(0);
    expect(result.caretInfo.desired_col).toBeGreaterThanOrEqual(0);

    // selectionInfo should be null (no selection initially)
    expect(result.selectionInfo).toBeNull();
  });

  test('WASM setSelection command should work', async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Call WASM setSelection and verify it works
    const result = await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      const editor = app?.editor;

      // Create position objects
      const anchor = { stave: 0, col: 0 };
      const head = { stave: 0, col: 3 };

      // Set selection via WASM
      editor.wasmModule.setSelection(anchor, head);

      // Query selection info
      const selectionInfo = editor.wasmModule.getSelectionInfo();

      return selectionInfo;
    });

    // Verify selection was set
    expect(result).toBeDefined();
    expect(result.is_empty).toBe(false);
    expect(result.anchor).toEqual({ stave: 0, col: 0 });
    expect(result.head).toEqual({ stave: 0, col: 3 });
    expect(result.start).toEqual({ stave: 0, col: 0 });
    expect(result.end).toEqual({ stave: 0, col: 3 });
    expect(result.is_forward).toBe(true);
  });
});
