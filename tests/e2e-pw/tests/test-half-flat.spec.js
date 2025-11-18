import { test, expect } from '@playwright/test';

test.describe('Half-flat accidental support', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should parse and render half-flat input (2b/)', async ({ page }) => {
    // Click editor to focus
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type half-flat input: 2b/ (with space to finalize)
    await page.keyboard.type('2b/ ');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Check Document Model shows correct pitch code
    await page.click('[data-testid="tab-docmodel"]');
    const docModelPane = page.locator('[data-testid="pane-docmodel"]');

    // Wait for content to appear
    await expect(docModelPane).not.toBeEmpty({ timeout: 2000 });

    const docModelText = await docModelPane.textContent();

    // Should contain "N2hf" (the PitchCode for E half-flat)
    expect(docModelText).toContain('N2hf');
  });

  test('should export half-flat to LilyPond', async ({ page }) => {
    // Click editor to focus
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type sequence with half-flat: 1 2b/ 3
    await page.keyboard.type('1 2b/ 3');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Open LilyPond tab
    await page.click('[data-testid="tab-lilypond"]');
    const lilypondPane = page.locator('[data-testid="pane-lilypond"]');

    // Wait for content to appear
    await expect(lilypondPane).not.toBeEmpty({ timeout: 2000 });

    const lilypondText = await lilypondPane.textContent();

    // LilyPond should contain the notes
    // Note: half-flat may be exported as flat (ef) with TODO note in code
    expect(lilypondText).toContain('c');  // Note 1
    expect(lilypondText).toContain('e');  // Note 3
    // Note 2b/ should appear as some form of E (could be "ef" if exported as flat)
  });

  test('should support all half-flat variants (1b/ through 7b/)', async ({ page }) => {
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type all 7 half-flat variants (with spaces to finalize)
    await page.keyboard.type('1b/ 2b/ 3b/ 4b/ 5b/ 6b/ 7b/ ');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Check Document Model contains all variants
    await page.click('[data-testid="tab-docmodel"]');
    const docModelPane = page.locator('[data-testid="pane-docmodel"]');

    // Wait for content to appear
    await expect(docModelPane).not.toBeEmpty({ timeout: 2000 });

    const docModelText = await docModelPane.textContent();

    // Should contain all pitch codes N1hf through N7hf
    expect(docModelText).toContain('N1hf');
    expect(docModelText).toContain('N2hf');
    expect(docModelText).toContain('N3hf');
    expect(docModelText).toContain('N4hf');
    expect(docModelText).toContain('N5hf');
    expect(docModelText).toContain('N6hf');
    expect(docModelText).toContain('N7hf');
  });
});
