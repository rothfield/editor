import { test, expect } from '@playwright/test';

test('Test non-pitch characters rendering', async ({ page }) => {
  const logs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (msg.type() === 'log') {
      console.log('[BROWSER LOG]', text);
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
    console.error('[PAGE ERROR]', error.message);
  });

  await page.goto('/');

  const editor = page.locator('[data-testid="editor-root"]');
  await expect(editor).toBeVisible({ timeout: 10000 });

  await page.waitForTimeout(1000);

  // Click to focus
  await editor.click();

  // Type: pitches, barline, text
  await page.keyboard.type('1 2 | 3');

  await page.waitForTimeout(500);

  // Check cells
  const cells = page.locator('.char-cell');
  const cellCount = await cells.count();
  console.log(`\nRendered ${cellCount} cells`);

  // Get all cell text content
  const cellTexts = await cells.allTextContents();
  console.log('Cell texts:', cellTexts);

  // Get cells by kind
  const pitchedCells = page.locator('.char-cell.kind-pitched');
  const barlineCells = page.locator('.char-cell.kind-barline');
  const whitespaceCells = page.locator('.char-cell.kind-whitespace');

  const pitchedCount = await pitchedCells.count();
  const barlineCount = await barlineCells.count();
  const whitespaceCount = await whitespaceCells.count();

  console.log(`\nPitched cells: ${pitchedCount}`);
  console.log(`Barline cells: ${barlineCount}`);
  console.log(`Whitespace cells: ${whitespaceCount}`);

  // Get visible dimensions of each cell
  for (let i = 0; i < cellCount; i++) {
    const cell = cells.nth(i);
    const bbox = await cell.boundingBox();
    const text = await cell.textContent();
    const classes = await cell.getAttribute('class');
    console.log(`Cell ${i}: text="${text}", width=${bbox?.width || 0}, classes="${classes}"`);
  }

  // Check for errors
  if (errors.length > 0) {
    console.error('\n=== ERRORS ===');
    errors.forEach(err => console.error(err));
    console.error('==============\n');
  }
  expect(errors).toHaveLength(0);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/non-pitch-test.png' });

  console.log('\n✅ Non-pitch character test COMPLETED');
});
