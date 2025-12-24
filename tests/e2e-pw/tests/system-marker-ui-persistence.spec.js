// @ts-check
import { test, expect } from '@playwright/test';

test.describe('System Marker UI Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    });

    await page.evaluate(() => {
      window.editor.createNewDocument();
    });

    await page.waitForSelector('.notation-line-container');
  });

  test('setting line 0 to «1 should NOT change line 1 marker', async ({ page }) => {
    // Add a second line
    await page.evaluate(async () => {
      await window.editor.wasmModule.insertNewline();
      await window.editor.renderAndUpdate();
    });

    await page.waitForSelector('.system-marker-indicator[data-line-index="1"]');

    // Get indicators
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    const indicator1 = page.locator('.system-marker-indicator[data-line-index="1"]');

    // Initial state
    await expect(indicator0).toHaveText('·');
    await expect(indicator1).toHaveText('·');

    // Check WASM state before
    const before = await page.evaluate(() => {
      return {
        line0: window.editor.wasmModule.getSystemStart(0),
        line1: window.editor.wasmModule.getSystemStart(1),
        doc: window.editor.getDocument().lines.map(l => ({
          count: l.system_start_count,
          system_id: l.system_id
        }))
      };
    });

    console.log('BEFORE clicking line 0:', before);

    // Click line 0 to set it to «1
    await indicator0.click();
    await page.waitForTimeout(200);

    // Check WASM state after
    const after = await page.evaluate(() => {
      return {
        line0: window.editor.wasmModule.getSystemStart(0),
        line1: window.editor.wasmModule.getSystemStart(1),
        doc: window.editor.getDocument().lines.map(l => ({
          count: l.system_start_count,
          system_id: l.system_id
        }))
      };
    });

    console.log('After click:', after);

    // CRITICAL: Line 0 should have count=1, Line 1 should stay 0
    expect(after.line0).toBe(1);
    expect(after.line1).toBe(0); // Should NOT change!

    // Check UI indicators
    const ui0 = await indicator0.textContent();
    const ui1 = await indicator1.textContent();

    console.log('UI indicators:', { ui0, ui1 });

    // Line 0 should show «1
    expect(ui0).toBe('«1');

    // CRITICAL: Line 1 should show standalone (·), not end indicator
    expect(ui1).toBe('·');

    // Check DocModel
    expect(after.doc[0].count).toBe(1);
    expect(after.doc[1].count).toBeUndefined(); // Should be undefined (no marker)
  });

  test('setting line 0 to «2 should show └ on line 1', async ({ page }) => {
    // Add a second line
    await page.evaluate(async () => {
      await window.editor.wasmModule.insertNewline();
      await window.editor.renderAndUpdate();
    });

    await page.waitForSelector('.system-marker-indicator[data-line-index="1"]');

    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    const indicator1 = page.locator('.system-marker-indicator[data-line-index="1"]');

    // Set line 0 to «2 (2-line system)
    await indicator0.click(); // → «1
    await page.waitForTimeout(50);
    await indicator0.click(); // → «2
    await page.waitForTimeout(200);

    // Check WASM state
    const state = await page.evaluate(() => {
      return {
        line0_count: window.editor.wasmModule.getSystemStart(0),
        line1_count: window.editor.wasmModule.getSystemStart(1),
        line0_role: window.editor.wasmModule.getLineSystemRole(0),
        line1_role: window.editor.wasmModule.getLineSystemRole(1),
        doc: window.editor.getDocument().lines.map(l => ({
          count: l.system_start_count,
          system_id: l.system_id
        }))
      };
    });

    console.log('After setting «2:', state);

    // Line 0 should have count=2, Line 1 should stay 0
    expect(state.line0_count).toBe(2);
    expect(state.line1_count).toBe(0);

    // Roles should be correct
    expect(state.line0_role.type).toBe('start');
    expect(state.line0_role.count).toBe(2);
    expect(state.line1_role.type).toBe('end');

    // Check UI
    const ui0 = await indicator0.textContent();
    const ui1 = await indicator1.textContent();

    console.log('UI indicators for 2-line system:', { ui0, ui1 });

    expect(ui0).toBe('«2');
    expect(ui1).toBe('└'); // Should show end indicator

    // Both lines should be in system 1
    expect(state.doc[0].system_id).toBe(1);
    expect(state.doc[1].system_id).toBe(1);
  });
});
