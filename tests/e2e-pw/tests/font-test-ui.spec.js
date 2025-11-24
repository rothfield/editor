import { test, expect } from '@playwright/test';

test.describe('Font Test UI', () => {
  test('Font Test tab exists and can be opened', async ({ page }) => {
    await page.goto('/');

    // Check if Font Test tab button exists
    const fontTestTab = page.getByTestId('tab-font-test');
    await expect(fontTestTab).toBeVisible();

    // Click the Font Test tab
    await fontTestTab.click();

    // Check if the tab content is visible
    const fontTestGrid = page.locator('#font-test-grid');
    await expect(fontTestGrid).toBeVisible();

    // Wait a moment for glyphs to render
    await page.waitForTimeout(500);

    // Check that some glyphs are rendered
    const glyphItems = page.locator('#font-test-grid [style*="NotationMono"]');
    const count = await glyphItems.count();

    console.log(`Found ${count} glyphs in font test grid`);
    expect(count).toBeGreaterThan(0);
  });

  test('Show All button displays all glyphs', async ({ page }) => {
    await page.goto('/');

    const fontTestTab = page.getByTestId('tab-font-test');
    await fontTestTab.click();

    const showAllBtn = page.locator('#font-test-show-all');
    await expect(showAllBtn).toBeVisible();

    await showAllBtn.click();
    await page.waitForTimeout(500);

    // Should have both octave and sharp sections
    const sections = page.locator('#font-test-grid h4');
    const sectionCount = await sections.count();

    console.log(`Found ${sectionCount} sections in font test`);
    expect(sectionCount).toBeGreaterThanOrEqual(2); // At least octaves and sharps
  });

  test('Show Sharps button displays only sharp accidentals', async ({ page }) => {
    await page.goto('/');

    const fontTestTab = page.getByTestId('tab-font-test');
    await fontTestTab.click();

    const sharpsBtn = page.locator('#font-test-show-sharps');
    await expect(sharpsBtn).toBeVisible();

    await sharpsBtn.click();
    await page.waitForTimeout(500);

    // Check heading for "Sharp"
    const heading = page.locator('#font-test-grid h4');
    const text = await heading.textContent();

    console.log(`Tab heading: ${text}`);
    expect(text).toContain('Sharp');

    // Should have 47 sharp glyphs
    const items = page.locator('.font-test-glyph-item');
    const count = await items.count();
    console.log(`Found ${count} glyph items for sharps`);
    expect(count).toBe(47);
  });

  test('Show Octaves button displays only octave variants', async ({ page }) => {
    await page.goto('/');

    const fontTestTab = page.getByTestId('tab-font-test');
    await fontTestTab.click();

    const octavesBtn = page.locator('#font-test-show-octaves');
    await expect(octavesBtn).toBeVisible();

    await octavesBtn.click();
    await page.waitForTimeout(500);

    // Check heading for "Octave"
    const heading = page.locator('#font-test-grid h4');
    const text = await heading.textContent();

    console.log(`Tab heading: ${text}`);
    expect(text).toContain('Octave');

    // Should have 188 octave variants (47 chars × 4 variants)
    const items = page.locator('.font-test-glyph-item');
    const count = await items.count();
    console.log(`Found ${count} glyph items for octaves`);
    expect(count).toBe(188);
  });

  test('Sharps display correctly in font test (verify U+E019 range)', async ({ page }) => {
    await page.goto('/');

    const fontTestTab = page.getByTestId('tab-font-test');
    await fontTestTab.click();

    const sharpsBtn = page.locator('#font-test-show-sharps');
    await sharpsBtn.click();
    await page.waitForTimeout(500);

    // Get first sharp glyph and verify its codepoint
    const firstGlyph = page.locator('.font-test-glyph-item').first();
    await expect(firstGlyph).toBeVisible();

    // Check if the codepoint display shows E1F0
    const cpText = await firstGlyph.locator('.font-test-glyph-codepoint').textContent();
    console.log(`First sharp codepoint: ${cpText}`);
    expect(cpText).toBe('U+E019');
  });

  test('Octaves display correctly in font test (verify U+E000 range)', async ({ page }) => {
    await page.goto('/');

    const fontTestTab = page.getByTestId('tab-font-test');
    await fontTestTab.click();

    const octavesBtn = page.locator('#font-test-show-octaves');
    await octavesBtn.click();
    await page.waitForTimeout(500);

    // Get first glyph codepoint
    const cpText = await page.locator('#font-test-grid .text-blue-600').first().textContent();
    console.log(`First octave codepoint: ${cpText}`);
    expect(cpText).toBe('U+E000');
  });
});
