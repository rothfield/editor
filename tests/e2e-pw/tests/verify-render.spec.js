import { test, expect } from '@playwright/test';

test('Verify character rendering after cache fix', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(500);

  // Take screenshot first for visual inspection
  await page.screenshot({ path: 'artifacts/verify-render.png', fullPage: true });
  console.log('Screenshot saved to artifacts/verify-render.png');

  // Check for pitched elements specifically (not whitespace)
  const pitchedCells = page.locator('.char-cell.kind-pitched');
  const count = await pitchedCells.count();
  console.log(`Found ${count} pitched cells`);

  // Should have 3 pitched cells (1, 2, 3)
  expect(count).toBe(3);

  // Get text content of cells (should be PUA characters)
  const cellTexts = await pitchedCells.allTextContents();
  console.log('Cell texts:', cellTexts.map(t => t ? `U+${t.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}` : 'empty'));

  // Verify cells have content
  for (let i = 0; i < count; i++) {
    const cellText = cellTexts[i];
    expect(cellText.length).toBeGreaterThan(0);
    console.log(`Cell ${i}: "${cellText}" (length: ${cellText.length}, codepoint: U+${cellText.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`);
  }
});
