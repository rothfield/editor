/**
 * FAILING TEST: Clicking on a Line Should Highlight It
 *
 * When the user clicks on a line to position the cursor, that line
 * should become the current line and get the border highlighting.
 */

import { test, expect } from '@playwright/test';

test.describe('FAILING: Click Highlights Current Line', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('FAILING: Clicking on line 0 should highlight line 0', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 3 lines
    await page.keyboard.type('Line 0 content');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 1 content');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2 content');
    await page.waitForTimeout(300);

    // Initially on line 2
    let currentLine = page.locator('.notation-line.current-line');
    let lineIndex = await currentLine.getAttribute('data-line');
    console.log(`Initial current line: ${lineIndex}`);

    // Get all lines
    const lines = await page.locator('.notation-line').all();
    expect(lines.length).toBe(3);

    // Click on line 0
    await lines[0].click();
    await page.waitForTimeout(300);

    // Check that line 0 is now highlighted
    currentLine = page.locator('.notation-line.current-line');
    lineIndex = await currentLine.getAttribute('data-line');

    console.log(`After clicking line 0: current line is ${lineIndex}`);

    expect(lineIndex).toBe('0');
    console.log('✅ Clicking line 0 highlights line 0');
  });

  test('FAILING: Clicking different lines updates the highlight', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 3 lines
    await page.keyboard.type('AAAA');
    await page.keyboard.press('Enter');
    await page.keyboard.type('BBBB');
    await page.keyboard.press('Enter');
    await page.keyboard.type('CCCC');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Click on line 0
    await lines[0].click();
    await page.waitForTimeout(300);

    let currentLine = page.locator('.notation-line.current-line');
    let lineIndex = await currentLine.getAttribute('data-line');
    console.log(`Clicked line 0, border on line: ${lineIndex}`);
    expect(lineIndex).toBe('0');

    // Click on line 1
    await lines[1].click();
    await page.waitForTimeout(300);

    currentLine = page.locator('.notation-line.current-line');
    lineIndex = await currentLine.getAttribute('data-line');
    console.log(`Clicked line 1, border on line: ${lineIndex}`);
    expect(lineIndex).toBe('1');

    // Click on line 2
    await lines[2].click();
    await page.waitForTimeout(300);

    currentLine = page.locator('.notation-line.current-line');
    lineIndex = await currentLine.getAttribute('data-line');
    console.log(`Clicked line 2, border on line: ${lineIndex}`);
    expect(lineIndex).toBe('2');

    console.log('✅ Border follows clicks through all lines');
  });

  test('FAILING: Clicking in empty space of a line highlights that line', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create lines with different amounts of content
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await page.keyboard.type('BBBBBBBBBB');
    await page.keyboard.press('Enter');
    await page.keyboard.type('C');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Click in the empty space to the right of "A" on line 0
    const line0Box = await lines[0].boundingBox();
    if (line0Box) {
      // Click far to the right (empty space)
      await page.mouse.click(line0Box.x + line0Box.width - 50, line0Box.y + line0Box.height / 2);
      await page.waitForTimeout(300);

      let currentLine = page.locator('.notation-line.current-line');
      let lineIndex = await currentLine.getAttribute('data-line');
      console.log(`Clicked empty space on line 0, border on: ${lineIndex}`);
      expect(lineIndex).toBe('0');
    }

    // Click on line 2 with short content
    const line2Box = await lines[2].boundingBox();
    if (line2Box) {
      await page.mouse.click(line2Box.x + 50, line2Box.y + line2Box.height / 2);
      await page.waitForTimeout(300);

      let currentLine = page.locator('.notation-line.current-line');
      let lineIndex = await currentLine.getAttribute('data-line');
      console.log(`Clicked line 2, border on: ${lineIndex}`);
      expect(lineIndex).toBe('2');
    }

    console.log('✅ Clicking anywhere on a line highlights that line');
  });

  test('FAILING: Visual feedback is immediate after click', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 2 lines
    await page.keyboard.type('First line');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second line');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Click on line 0
    await lines[0].click();

    // Check immediately (no extra wait) - should be instant
    const currentLine = page.locator('.notation-line.current-line');
    await expect(currentLine).toBeVisible({ timeout: 100 });

    const lineIndex = await currentLine.getAttribute('data-line');
    expect(lineIndex).toBe('0');

    console.log('✅ Border updates immediately after click (no lag)');
  });

  test('DOCUMENTATION: How click highlighting should work', async ({ page }) => {
    console.log('\n=== CLICK HIGHLIGHTING REQUIREMENTS ===\n');
    console.log('When user clicks on a line:');
    console.log('  1. Cursor position updates to clicked location');
    console.log('  2. theDocument.state.cursor.line updates to clicked line');
    console.log('  3. render() is called to update the UI');
    console.log('  4. renderLineFromDisplayList checks cursor.line for each line');
    console.log('  5. Line matching cursor.line gets .current-line class');
    console.log('  6. Border appears around that line');
    console.log('\nExpected behavior:');
    console.log('  - Click line 0 → line 0 highlighted');
    console.log('  - Click line 1 → line 1 highlighted');
    console.log('  - Click line 2 → line 2 highlighted');
    console.log('  - Clicking anywhere on a line highlights the whole line');
    console.log('  - Update is immediate (happens during render cycle)');
    console.log('\n========================================\n');
  });
});
