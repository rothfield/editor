/**
 * Simple test to verify selection persistence
 */

import { test, expect } from '@playwright/test';

test.describe('Simple Selection Test', () => {
  test('verify startSelectionAt and extendSelectionTo work', async ({ page }) => {
    // Capture all console logs
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "123"
    await page.keyboard.type('123');
    await page.waitForTimeout(300);

    // Create selection using NEW functions
    const result = await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      const editor = app.editor;
      const wasm = editor.wasmModule;

      // Check if new functions exist
      const hasStartAt = typeof wasm.startSelectionAt === 'function';
      const hasExtendTo = typeof wasm.extendSelectionTo === 'function';

      if (!hasStartAt || !hasExtendTo) {
        return {
          error: 'New functions not available',
          hasStartAt,
          hasExtendTo
        };
      }

      // Call new functions
      wasm.startSelectionAt(0, 1);
      wasm.extendSelectionTo(0, 3);

      // Get snapshot
      const doc = wasm.getDocumentSnapshot();

      return {
        cursor: doc.state.cursor,
        selectionManager: doc.state.selection_manager,
        hasSelection: doc.state.selection_manager && doc.state.selection_manager.current_selection !== null
      };
    });

    console.log('Result:', JSON.stringify(result, null, 2));

    // Check result
    if (result.error) {
      console.log('ERROR:', result.error);
      console.log('hasStartAt:', result.hasStartAt);
      console.log('hasExtendTo:', result.hasExtendTo);
    } else {
      console.log('Selection created:', result.hasSelection);
      if (result.hasSelection) {
        console.log('Selection:', result.selectionManager.current_selection);
      }
    }

    // Print relevant WASM logs
    const wasmLogs = logs.filter(log => log.includes('startSelectionAt') || log.includes('extendSelectionTo') || log.includes('Selection before serialize'));
    console.log('Relevant WASM logs:', wasmLogs);

    // Expect new functions to exist
    expect(result.hasStartAt).toBe(true);
    expect(result.hasExtendTo).toBe(true);

    // Expect selection to be created
    expect(result.hasSelection).toBe(true);
  });
});
