/**
 * Quick test for layered ornament API
 * Verifies the new annotation layer ornament system
 */

import { test, expect } from '@playwright/test';

test.describe('Layered Ornament API - Quick Verification', () => {
  test('should have layered ornament functions available', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Check that all layered ornament functions are available
    const functionsAvailable = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const wasm = editor.wasmModule;

      return {
        applyOrnamentLayered: typeof wasm.applyOrnamentLayered === 'function',
        removeOrnamentLayered: typeof wasm.removeOrnamentLayered === 'function',
        getOrnamentAt: typeof wasm.getOrnamentAt === 'function',
        getOrnamentsForLine: typeof wasm.getOrnamentsForLine === 'function',
        applyAnnotationOrnamentsToCells: typeof wasm.applyAnnotationOrnamentsToCells === 'function'
      };
    });

    console.log('Layered ornament functions:', functionsAvailable);

    expect(functionsAvailable.applyOrnamentLayered).toBe(true);
    expect(functionsAvailable.removeOrnamentLayered).toBe(true);
    expect(functionsAvailable.getOrnamentAt).toBe(true);
    expect(functionsAvailable.getOrnamentsForLine).toBe(true);
    expect(functionsAvailable.applyAnnotationOrnamentsToCells).toBe(true);

    console.log('✅ All layered ornament functions are available!');
  });

  test('should apply ornament via layered API', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament to position (0, 0) with notation "4 5"
    const result = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'after');
    });

    console.log('Apply ornament result:', result);
    expect(result.success).toBe(true);

    // Get ornament at position
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Get ornament result:', ornament);
    expect(ornament.notation).toBe('4 5');
    expect(ornament.placement).toBe('after');

    // Get all ornaments for line
    const ornaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentsForLine(0);
    });

    console.log('Get ornaments for line:', ornaments);
    expect(ornaments.length).toBe(1);
    expect(ornaments[0].notation).toBe('4 5');

    console.log('✅ Layered ornament API works correctly!');
  });

  test('should remove ornament via layered API', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament
    await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.applyOrnamentLayered(0, 0, '4 5', 'after');
    });

    // Remove ornament
    const removeResult = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.removeOrnamentLayered(0, 0);
    });

    console.log('Remove ornament result:', removeResult);
    expect(removeResult.success).toBe(true);

    // Verify ornament is gone
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Get ornament after removal:', ornament);
    expect(ornament).toBe(null);

    console.log('✅ Remove ornament works correctly!');
  });
});
