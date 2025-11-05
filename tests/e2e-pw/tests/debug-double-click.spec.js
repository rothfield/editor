import { test, expect } from '@playwright/test';

test('Debug double-click on second beat', async ({ page }) => {
  // Listen to console messages
  page.on('console', msg => console.log('[BROWSER]:', msg.text()));

  await page.goto('http://localhost:8080');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Focus editor
  await editor.click();

  // Type two beats separated by spaces: "S--r  g-m"
  await page.keyboard.type('S--r  g-m');

  // Wait for rendering and for click counter to reset
  await page.waitForTimeout(600); // Longer than CLICK_DELAY (500ms)

  // Get all cells
  const cells = await page.locator('.char-cell').all();
  console.log(`Found ${cells.length} cells`);

  if (cells.length > 6) {
    // Log all cell contents
    for (let i = 0; i < cells.length; i++) {
      const text = await cells[i].textContent();
      console.log(`Cell ${i}: "${text}"`);
    }

    // Try clicking on different cells in the second beat
    console.log('\n=== Test 1: Double-click on cell 6 (g) ===');
    await cells[6].dblclick();
    await page.waitForTimeout(200);
    let selectedCells = await page.locator('.char-cell.selected').all();
    console.log(`Selected ${selectedCells.length} cells`);
    for (const cell of selectedCells) {
      const index = await cell.getAttribute('data-cell-index');
      const text = await cell.textContent();
      console.log(`  Cell ${index}: "${text}"`);
    }

    // Clear selection by single-clicking - wait long enough for click counter to fully reset
    await cells[0].click();
    await page.waitForTimeout(600);

    console.log('\n=== Test 2: Double-click on cell 7 (dash) ===');
    await cells[7].dblclick();
    await page.waitForTimeout(200);
    selectedCells = await page.locator('.char-cell.selected').all();
    console.log(`Selected ${selectedCells.length} cells`);
    for (const cell of selectedCells) {
      const index = await cell.getAttribute('data-cell-index');
      const text = await cell.textContent();
      console.log(`  Cell ${index}: "${text}"`);
    }

    // Clear selection by single-clicking - wait long enough for click counter to fully reset
    await cells[0].click();
    await page.waitForTimeout(600);

    console.log('\n=== Test 3: Double-click on cell 8 (m) ===');
    await cells[8].dblclick();
    await page.waitForTimeout(200);
    selectedCells = await page.locator('.char-cell.selected').all();
    console.log(`Selected ${selectedCells.length} cells`);
    for (const cell of selectedCells) {
      const index = await cell.getAttribute('data-cell-index');
      const text = await cell.textContent();
      console.log(`  Cell ${index}: "${text}"`);
    }

  }
});
