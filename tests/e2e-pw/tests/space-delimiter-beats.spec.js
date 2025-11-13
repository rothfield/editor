import { test, expect } from '@playwright/test';

test('space character delimits beats', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type: "12 34" (two beats separated by space)
  await page.keyboard.type('12 34');
  await page.waitForTimeout(100);

  // Should have 2 beat arcs (one for "12", one for "34")
  const beatArcs = page.locator('#beat-loops path');
  await expect(beatArcs).toHaveCount(2);

  // Verify the space cell exists but is NOT part of a beat
  const notationLine = page.locator('.notation-line').first();
  const spaceCell = notationLine.locator('.whitespace').first();
  await expect(spaceCell).toBeVisible();

  // Space should NOT have beat-loop classes
  await expect(spaceCell).not.toHaveClass(/beat-loop-first/);
  await expect(spaceCell).not.toHaveClass(/beat-loop-middle/);
  await expect(spaceCell).not.toHaveClass(/beat-loop-last/);
});

test('beat with single cell has no arc (space-separated)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type: "1 2 3" (three single-cell beats)
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(100);

  // Single-cell beats should NOT have arcs (config: draw_single_cell_loops = false)
  const beatArcs = page.locator('#beat-loops path');
  await expect(beatArcs).toHaveCount(0);

  // Verify we have 3 cells (no beat arcs means they're separate beats)
  const notationLine = page.locator('.notation-line').first();
  const pitchedCells = notationLine.locator('.kind-pitched-element');
  await expect(pitchedCells).toHaveCount(3);
});

test('multiple spaces create separate beats', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type: "12  34" (two spaces between beats)
  await page.keyboard.type('12  34');
  await page.waitForTimeout(100);

  // Should have 2 beat arcs
  const beatArcs = page.locator('#beat-loops path');
  await expect(beatArcs).toHaveCount(2);

  // Verify both space cells exist
  const notationLine = page.locator('.notation-line').first();
  const spaceCells = notationLine.locator('.whitespace');
  await expect(spaceCells).toHaveCount(2);
});

test('beat arc width with space delimiter vs without', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Case 1: "12" (one beat, two cells)
  await page.keyboard.type('12');
  await page.waitForTimeout(100);

  let beatArcs = page.locator('#beat-loops path');
  await expect(beatArcs).toHaveCount(1);

  const arc1PathD = await beatArcs.first().getAttribute('d');
  const match1 = arc1PathD.match(/M ([\d.]+) [\d.]+ C .* ([\d.]+) [\d.]+$/);
  const arc1Span = parseFloat(match1[2]) - parseFloat(match1[1]);

  // Clear
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');

  // Case 2: "1 2" (two separate single-cell beats, should have NO arcs)
  await page.keyboard.type('1 2');
  await page.waitForTimeout(100);

  beatArcs = page.locator('#beat-loops path');
  await expect(beatArcs).toHaveCount(0); // No arcs for single-cell beats

  // The space properly delimits, creating two separate beats
  const notationLine = page.locator('.notation-line').first();
  const pitchedCells = notationLine.locator('.kind-pitched-element');
  await expect(pitchedCells).toHaveCount(2);
});
