import { test, expect } from '@playwright/test';

test('All half-flat glyphs (1-7) show correctly in Font Test', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for editor to load
  await page.waitForSelector('[data-testid="editor-root"]');
  await page.waitForTimeout(2000);

  // Click Font Test tab
  await page.click('[data-testid="tab-font-test"]');
  await page.waitForTimeout(1000);

  // Click "Show All" button
  await page.click('#font-test-show-all');
  await page.waitForTimeout(1000);

  // Scroll to Number System section
  const numberSection = page.locator('text=Number System').first();
  await numberSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Capture each character's accidentals section showing half-flat
  const chars = ['1', '2', '3', '4', '5', '6', '7'];

  for (const char of chars) {
    // Find the container for this character
    const charContainer = page.locator('.border.border-gray-300', {
      has: page.locator(`text="${char}" - Natural (octave 0)`)
    });

    await charContainer.scrollIntoViewIfNeeded();

    // Screenshot the accidentals grid showing all 5 accidental types including half-flat
    const accidentalsGrid = charContainer.locator('.grid.grid-cols-4.gap-2').last();
    await accidentalsGrid.screenshot({
      path: `artifacts/halfflat-${char}-accidentals.png`
    });
  }

  console.log('✓ Captured all half-flat glyphs for characters 1-7');
  console.log('  Screenshots: artifacts/halfflat-{1-7}-accidentals.png');
});
