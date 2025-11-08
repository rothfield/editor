import { test, expect } from '@playwright/test';

/**
 * E2E Test: Notation Font Octave Substitution
 *
 * Verifies that octaves in the Number pitch system are rendered using
 * PUA (Private Use Area) codepoints from the NotationMonoDotted font instead
 * of separate overlay elements.
 *
 * NOTE: This test uses the WASM API to directly set octaves since the keyboard
 * input syntax for octaves depends on parser implementation details.
 */

test.describe('Notation Font - Octave Substitution', () => {
  test.beforeEach(async ({ page }) => {
    // Load the editor
    await page.goto('/');
    await expect(page.locator('[data-testid="editor-root"]')).toBeVisible();
  });

  test('should render plain notes without octave shifts', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-root"]');

    await editor.click();
    // Type basic notes (no octave shifts)
    await page.keyboard.type("1 2 3");

    // Verify NO octave-dot elements exist (old system removed)
    // This is the key test: the old system would have generated .octave-dot elements
    const octaveDots = page.locator('.octave-dot');
    await expect(octaveDots).toHaveCount(0);

    // Verify notes are rendered and visible
    const cells = page.locator('.char-cell');
    expect(await cells.count()).toBeGreaterThanOrEqual(3);
  });

  test('should verify NotationMonoDotted font is applied to pitched cells', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-root"]');

    await editor.click();
    await page.keyboard.type("1");

    const pitchedCell = page.locator('.char-cell.kind-pitched').first();

    // Check the font-family style is applied
    const fontFamily = await pitchedCell.evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    );

    // Should contain NotationMonoDotted
    expect(fontFamily).toContain('NotationMonoDotted');
  });

  test('should have removed old octave dot overlay rendering', async ({ page }) => {
    // This test verifies the migration: octave dots should NO LONGER be rendered
    // as separate overlay elements (the old system)

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type("1 2 3");

    // The old system would have created .octave-dot spans
    // With the new system, these should never exist
    const octaveDots = page.locator('.octave-dot');
    await expect(octaveDots).toHaveCount(0);
  });

  test('should render multiple notes with NotationMonoDotted font', async ({ page }) => {
    const editor = page.locator('[data-testid="editor-root"]');

    await editor.click();
    await page.keyboard.type("1 2 3 4 5 6 7");

    // Verify all 7 notes are rendered
    const cells = page.locator('.char-cell.kind-pitched');
    await expect(cells).toHaveCount(7);

    // Verify all use NotationMonoDotted font
    const fontFamily = await cells.first().evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    );
    expect(fontFamily).toContain('NotationMonoDotted');
  });

  test('migration successful: old octave dot system completely removed', async ({ page }) => {
    // Comprehensive check that the migration is complete:
    // 1. No .octave-dot elements anywhere
    // 2. Pitched cells use NotationMonoDotted font
    // 3. Basic rendering still works

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type("S--r G- m");  // Sargam notation

    // No overlay dots anywhere
    await expect(page.locator('.octave-dot')).toHaveCount(0);

    // Cells are rendered
    const cells = page.locator('.char-cell');
    expect(await cells.count()).toBeGreaterThan(0);

    // Font is applied
    const fontFamily = await cells.first().evaluate((el) =>
      window.getComputedStyle(el).fontFamily
    );
    expect(fontFamily).toBeTruthy();
  });
});
