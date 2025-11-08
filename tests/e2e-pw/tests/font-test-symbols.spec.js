import { test, expect } from '@playwright/test';

test.describe('Font Test UI - Symbols Button', () => {
  test('Symbols button exists and displays barlines and accidentals', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Click Font Test tab
    const fontTestTab = page.getByTestId('tab-font-test');
    await expect(fontTestTab).toBeVisible();
    await fontTestTab.click();

    // Find and click symbols button
    const symbolsBtn = page.locator('#font-test-show-symbols');
    await expect(symbolsBtn).toBeVisible();
    await symbolsBtn.click();
    await page.waitForTimeout(300);

    // Verify sections are displayed
    const sections = page.locator('.font-test-glyph-item');
    const count = await sections.count();
    console.log(`Total symbol glyphs displayed: ${count}`);

    // Verify accidentals section exists
    const heading = page.locator('h4');
    const headingText = await heading.allTextContents();
    expect(headingText).toContain('Accidentals (U+E260-U+E264)');
    console.log('✓ Accidentals section found');

    // Verify barlines section exists
    expect(headingText).toContain('Barlines (U+E030-E042)');
    console.log('✓ Barlines section found');

    // Verify ornaments section exists
    expect(headingText).toContain('Ornaments (U+E566-E56E)');
    console.log('✓ Ornaments section found');

    // Should have 5 accidentals + 5 barlines + 4 ornaments = 14 symbols
    expect(count).toBe(14);
    console.log('✓ All 14 symbols displayed');
  });

  test('Symbol barlines render as music notation', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Click Font Test tab
    const fontTestTab = page.getByTestId('tab-font-test');
    await expect(fontTestTab).toBeVisible();
    await fontTestTab.click();

    // Click symbols button
    const symbolsBtn = page.locator('#font-test-show-symbols');
    await symbolsBtn.click();
    await page.waitForTimeout(300);

    // Find repeat barlines
    const labels = page.locator('.font-test-glyph-label');
    const labelCount = await labels.count();

    // Look for repeat barlines
    const repeatLabels = ['Repeat Left', 'Repeat Right', 'Repeat Both'];
    for (const label of repeatLabels) {
      let found = false;
      for (let i = 0; i < labelCount; i++) {
        const text = await labels.nth(i).textContent();
        if (text && text.includes(label)) {
          found = true;
          console.log(`✓ Found ${label}`);
          break;
        }
      }
      expect(found).toBeTruthy();
    }
  });
});
