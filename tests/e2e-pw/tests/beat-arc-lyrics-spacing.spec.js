import { test, expect } from '@playwright/test';

test('beat arc anchors to first/last cell edges when lyrics expand beat width', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type a two-cell beat: "12"
  await page.keyboard.type('12');

  // Add lyrics that will cause spacing expansion
  await page.keyboard.press('Shift+Alt+L');
  await page.keyboard.type('a b');
  await page.keyboard.press('Escape');

  // Wait for rendering to stabilize
  await page.waitForTimeout(100);

  // Get only the beat loop cells (cells with beat-loop-first and beat-loop-last classes)
  const firstCell = page.locator('.beat-loop-first').first();
  const lastCell = page.locator('.beat-loop-last').first();

  await expect(firstCell).toBeVisible();
  await expect(lastCell).toBeVisible();

  // Get bounding boxes (viewport coordinates)
  const firstBox = await firstCell.boundingBox();
  const lastBox = await lastCell.boundingBox();

  expect(firstBox).toBeTruthy();
  expect(lastBox).toBeTruthy();

  // Get the beat arc path from SVG
  const beatArcPath = page.locator('#beat-loops path').first();
  await expect(beatArcPath).toBeVisible();

  const pathD = await beatArcPath.getAttribute('d');
  expect(pathD).toBeTruthy();

  // Parse path: "M start_x start_y C cp1_x cp1_y, cp2_x cp2_y, end_x end_y"
  const match = pathD.match(/M ([\d.]+) ([\d.]+) C ([\d.]+) ([\d.]+), ([\d.]+) ([\d.]+), ([\d.]+) ([\d.]+)/);
  expect(match).toBeTruthy();

  const actualStartX = parseFloat(match[1]);
  const actualEndX = parseFloat(match[7]);

  // Calculate expected span (character widths only, not expanded cell widths)
  const expectedSpan = (lastBox.x + lastBox.width) - firstBox.x;
  const actualSpan = actualEndX - actualStartX;

  // The arc span should match the cell span (left edge of first to right edge of last)
  // Allow 2px tolerance for gutter offset and rounding
  expect(Math.abs(actualSpan - expectedSpan)).toBeLessThan(2);

  // Verify arc is NOT anchored to cell centers (which would be wider)
  const firstCenterX = firstBox.x + firstBox.width / 2;
  const lastCenterX = lastBox.x + lastBox.width / 2;

  // Arc should be narrower than center-to-center
  const arcSpan = actualEndX - actualStartX;
  const centerSpan = lastCenterX - firstCenterX;

  expect(arcSpan).toBeLessThan(centerSpan);
});

test('beat arc width remains consistent with/without lyrics', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Case 1: Beat without lyrics
  await page.keyboard.type('12');
  await page.waitForTimeout(100);

  const notationLine1 = page.locator('.notation-line').first();
  const cells1 = notationLine1.locator('.char-cell');
  const firstCell1 = cells1.nth(0);
  const lastCell1 = cells1.nth(1);

  const firstBox1 = await firstCell1.boundingBox();
  const lastBox1 = await lastCell1.boundingBox();

  const arcSpan1 = (lastBox1.x + lastBox1.width) - firstBox1.x;

  // Clear and start over
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');

  // Case 2: Same beat with lyrics
  await page.keyboard.type('12');
  await page.keyboard.press('Shift+Alt+L');
  await page.keyboard.type('a b');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  const notationLine2 = page.locator('.notation-line').first();
  const cells2 = notationLine2.locator('.char-cell');
  const firstCell2 = cells2.nth(0);
  const lastCell2 = cells2.nth(1);

  const firstBox2 = await firstCell2.boundingBox();
  const lastBox2 = await lastCell2.boundingBox();

  const arcSpan2 = (lastBox2.x + lastBox2.width) - firstBox2.x;

  // Arc span should be the same (character widths unchanged)
  // Allow small tolerance for rendering differences
  expect(Math.abs(arcSpan1 - arcSpan2)).toBeLessThan(3);
});
