import { test, expect } from '@playwright/test';

test('cursor advances after typing space', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "1"
  await page.keyboard.type('1');
  await page.waitForTimeout(100);

  // Find the cursor (should be after "1")
  let cursor = page.locator('.cursor-indicator').first();
  await expect(cursor).toBeVisible();

  // Get cursor position after "1"
  const box1 = await cursor.boundingBox();
  const cursorX1 = box1.x;

  console.log(`Cursor X after "1": ${cursorX1}`);

  // Type space
  await page.keyboard.type(' ');
  await page.waitForTimeout(100);

  // Get cursor position after "1 "
  cursor = page.locator('.cursor-indicator').first();
  const box2 = await cursor.boundingBox();
  const cursorX2 = box2.x;

  console.log(`Cursor X after "1 ": ${cursorX2}`);

  // Cursor should have moved to the right
  expect(cursorX2).toBeGreaterThan(cursorX1);
});

test('can type after space (string input)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "1 2" as a single string
  await page.keyboard.type('1 2');
  await page.waitForTimeout(100);

  // Single-cell beats don't get arcs, so check for cells instead
  const notationLine = page.locator('.notation-line').first();
  const pitchedCells = notationLine.locator('.kind-pitched');
  const cellCount = await pitchedCells.count();
  console.log(`Pitched cells after '1 2': ${cellCount}`);

  // Should have 2 pitched cells ("1" and "2")
  await expect(pitchedCells).toHaveCount(2);
});

test('can type after space (separate keypresses)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type character by character
  await page.keyboard.type('1');
  await page.waitForTimeout(50);
  await page.keyboard.type(' ');
  await page.waitForTimeout(50);
  await page.keyboard.type('2');
  await page.waitForTimeout(100);

  // Single-cell beats don't get arcs, so check for cells instead
  const notationLine = page.locator('.notation-line').first();
  const pitchedCells = notationLine.locator('.kind-pitched');
  const cellCount = await pitchedCells.count();
  console.log(`Pitched cells after '1' then ' ' then '2': ${cellCount}`);

  // Should have 2 pitched cells ("1" and "2")
  await expect(pitchedCells).toHaveCount(2);
});
