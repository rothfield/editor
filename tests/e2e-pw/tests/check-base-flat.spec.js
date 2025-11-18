import { test } from '@playwright/test';

test('Check base flat symbol (not half-flat)', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('[data-testid="editor-root"]');
  await page.waitForTimeout(2000);

  // Click Font Test tab
  await page.click('[data-testid="tab-font-test"]');
  await page.waitForTimeout(1000);
  await page.click('#font-test-show-all');
  await page.waitForTimeout(1000);

  // Scroll to Number System
  const numberSection = page.locator('text=Number System').first();
  await numberSection.scrollIntoViewIfNeeded();

  // Get the accidentals section for character "1"
  const char1Container = page.locator('.border.border-gray-300', {
    has: page.locator('text="1" - Natural (octave 0)')
  });

  // Screenshot just the accidentals showing flat vs half-flat
  const accidentalsGrid = char1Container.locator('.grid.grid-cols-4.gap-2').last();
  await accidentalsGrid.screenshot({
    path: 'artifacts/base-flat-vs-halfflat.png',
    scale: 'css'
  });

  // Also capture at large size for clarity
  await page.evaluate(() => {
    document.querySelector('#font-test-size').value = '32';
    document.querySelector('#font-test-size').dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(500);

  await accidentalsGrid.screenshot({
    path: 'artifacts/base-flat-vs-halfflat-large.png'
  });

  console.log('Screenshots saved:');
  console.log('- artifacts/base-flat-vs-halfflat.png (20pt)');
  console.log('- artifacts/base-flat-vs-halfflat-large.png (32pt)');
});
