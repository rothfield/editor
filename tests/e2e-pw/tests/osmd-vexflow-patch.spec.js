// @ts-check
import { test, expect } from '@playwright/test';

test.describe('OSMD VexFlow Patching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Wait for WASM to be ready
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    });
  });

  test('should not show VexFlow warning in console', async ({ page }) => {
    const warnings = [];
    const errors = [];

    // Capture console warnings and errors
    page.on('console', (msg) => {
      if (msg.type() === 'warning') {
        warnings.push(msg.text());
      } else if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Insert some notation
    await page.evaluate(() => {
      window.editor.wasmModule.insertText('| 1 2 3 4 |');
    });

    // Switch to Staff Notation tab to trigger OSMD initialization
    const staffTab = page.locator('[data-tab="staff-notation"]');
    await staffTab.click();
    await page.waitForTimeout(3000); // Wait for OSMD to initialize and render

    // Check for the specific VexFlow warning
    const hasVexFlowWarning = warnings.some(w =>
      w.includes('Cannot find VexFlow') ||
      w.includes('VexFlow to patch')
    );

    // Also check errors
    const hasVexFlowError = errors.some(e =>
      e.includes('Cannot find VexFlow') ||
      e.includes('VexFlow to patch')
    );

    expect(hasVexFlowWarning).toBe(false);
    expect(hasVexFlowError).toBe(false);

    if (warnings.length > 0) {
      console.log('Warnings found:', warnings.slice(0, 5));
    }
    if (errors.length > 0) {
      console.log('Errors found:', errors.slice(0, 5));
    }

    console.log('✅ No VexFlow patching warnings in console');
  });

  test('OSMD should render without errors', async ({ page }) => {
    const errors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Insert some notation
    await page.evaluate(() => {
      window.editor.wasmModule.setTitle('Test Song');
      window.editor.wasmModule.insertText('| 1 2 3 4 |');
    });

    // Switch to Staff Notation tab
    const staffTab = page.locator('[data-tab="staff-notation"]');
    await staffTab.click();
    await page.waitForTimeout(3000);

    // Check that staff notation container exists and has content
    const staffContainer = page.locator('#staff-notation-container');
    await expect(staffContainer).toBeVisible();

    // Verify SVG content was rendered by OSMD
    const hasSvg = await staffContainer.evaluate((el) => {
      return el.querySelector('svg') !== null;
    });

    expect(hasSvg).toBe(true);
    expect(errors.length).toBe(0);

    console.log('✅ OSMD rendered successfully without errors');
  });
});
