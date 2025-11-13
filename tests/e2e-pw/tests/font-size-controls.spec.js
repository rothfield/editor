/**
 * Font Size Controls Test
 * Verifies that font size selectors work in both Font Test and Font Sandbox tabs
 */

import { test, expect } from '@playwright/test';

test.describe('Font Size Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for editor to be ready
    const editor = page.locator('#editor-container');
    await expect(editor).toBeVisible();
  });

  test('Font Test tab has font size selector', async ({ page }) => {
    // Click on Font Test tab
    const fontTestTab = page.locator('#tab-font-test');
    await fontTestTab.click();

    // Check that font size selector exists
    const fontSizeSelector = page.locator('#font-test-size');
    await expect(fontSizeSelector).toBeVisible();

    // Check default value is 20pt
    await expect(fontSizeSelector).toHaveValue('20');
  });

  test('Font Test: changing font size updates glyph display', async ({ page }) => {
    // Navigate to Font Test tab
    const fontTestTab = page.locator('#tab-font-test');
    await fontTestTab.click();

    // Wait for grid to be populated
    const grid = page.locator('#font-test-grid');
    await expect(grid).toBeVisible();

    // Click "Comprehensive View" to ensure glyphs are displayed
    const showAllBtn = page.locator('#font-test-show-all');
    await showAllBtn.click();

    // Wait for glyphs to render
    await page.waitForTimeout(500);

    // Find a glyph display element
    const glyphDisplay = grid.locator('.font-test-glyph-display').first();
    await expect(glyphDisplay).toBeVisible();

    // Check initial font size is 20pt (26.67px)
    const initialFontSize = await glyphDisplay.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize));
    expect(initialFontSize).toBeCloseTo(26.67, 0.5);

    // Change font size to 32pt
    const fontSizeSelector = page.locator('#font-test-size');
    await fontSizeSelector.selectOption('32');

    // Wait for re-render
    await page.waitForTimeout(500);

    // Check that font size has changed to 32pt (42.67px)
    const newFontSize = await glyphDisplay.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize));
    expect(newFontSize).toBeCloseTo(42.67, 0.5);
  });

  test('Font Sandbox tab has font size selector', async ({ page }) => {
    // Click on Font Sandbox tab
    const fontSandboxTab = page.locator('#tab-font-sandbox');
    await fontSandboxTab.click();

    // Check that font size selector exists
    const fontSizeSelector = page.locator('#font-sandbox-size');
    await expect(fontSizeSelector).toBeVisible();

    // Check default value is 18pt
    await expect(fontSizeSelector).toHaveValue('18');
  });

  test('Font Sandbox: changing font size updates textarea', async ({ page }) => {
    // Navigate to Font Sandbox tab
    const fontSandboxTab = page.locator('#tab-font-sandbox');
    await fontSandboxTab.click();

    // Get the textarea
    const sandbox = page.locator('#font-sandbox');
    await expect(sandbox).toBeVisible();

    // Check initial font size is 18pt (24px)
    const initialFontSize = await sandbox.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize));
    expect(initialFontSize).toBeCloseTo(24, 0.5);

    // Change font size to 48pt
    const fontSizeSelector = page.locator('#font-sandbox-size');
    await fontSizeSelector.selectOption('48');

    // Wait a bit for the change to apply
    await page.waitForTimeout(200);

    // Check that font size has changed to 48pt (64px)
    const newFontSize = await sandbox.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize));
    expect(newFontSize).toBeCloseTo(64, 0.5);
  });

  test('Font size changes persist when switching views in Font Test', async ({ page }) => {
    // Navigate to Font Test tab
    const fontTestTab = page.locator('#tab-font-test');
    await fontTestTab.click();

    // Change font size to 36pt
    const fontSizeSelector = page.locator('#font-test-size');
    await fontSizeSelector.selectOption('36');

    // Click "Comprehensive View"
    const showAllBtn = page.locator('#font-test-show-all');
    await showAllBtn.click();
    await page.waitForTimeout(500);

    // Check font size in comprehensive view (36pt = 48px)
    const glyphDisplay1 = page.locator('.font-test-glyph-display').first();
    await expect(glyphDisplay1).toBeVisible();
    const fontSize1 = await glyphDisplay1.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize));
    expect(fontSize1).toBeCloseTo(48, 0.5);

    // Switch to Unicode Table view
    const tableBtn = page.locator('#font-test-show-table');
    await tableBtn.click();
    await page.waitForTimeout(500);

    // Check font size in table view (36pt = 48px)
    const tableGlyph = page.locator('td[style*="NotationFont"]').first();
    await expect(tableGlyph).toBeVisible();
    const fontSize2 = await tableGlyph.evaluate(el => parseFloat(window.getComputedStyle(el).fontSize));
    expect(fontSize2).toBeCloseTo(48, 0.5);

    // Verify selector still shows 36pt
    await expect(fontSizeSelector).toHaveValue('36');
  });
});
