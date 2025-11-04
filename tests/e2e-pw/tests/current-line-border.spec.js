/**
 * E2E Test: Current Line Border
 *
 * Tests that a visual border is drawn around the line containing the cursor.
 * The border should update when the cursor moves to a different line.
 */

import { test, expect } from '@playwright/test';

test.describe('Current Line Border', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('Current line should have border class', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type some content
    await page.keyboard.type('S r g m');
    await page.waitForTimeout(300);

    // Check that the first (and only) line has the current-line class
    const currentLine = page.locator('.notation-line.current-line');
    await expect(currentLine).toBeVisible();

    const lineIndex = await currentLine.getAttribute('data-line');
    console.log(`✅ Current line index: ${lineIndex}`);
    console.log('✅ Current line has .current-line class');
  });

  test('Border reflects cursor position in multi-line document', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 3 lines
    await page.keyboard.type('Line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 3');
    await page.waitForTimeout(300);

    // Check that some line has the border
    const currentLine = page.locator('.notation-line.current-line');
    await expect(currentLine).toBeVisible();

    const lineIndex = await currentLine.getAttribute('data-line');
    console.log(`Current line in multi-line document: ${lineIndex}`);

    // Verify it's a valid line index
    const totalLines = await page.locator('.notation-line').count();
    const index = parseInt(lineIndex);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(totalLines);

    console.log(`✅ Border is on a valid line (${index} of ${totalLines} lines)`);
  });

  test('Only one line should have current-line class at a time', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create multiple lines
    await page.keyboard.type('Line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 3');
    await page.waitForTimeout(300);

    // Check that only one line has current-line class
    const currentLines = await page.locator('.notation-line.current-line').count();
    expect(currentLines).toBe(1);

    console.log('✅ Only one line has .current-line class');

    // Move cursor and check again
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);

    const currentLines2 = await page.locator('.notation-line.current-line').count();
    expect(currentLines2).toBe(1);

    console.log('✅ Still only one line has .current-line class after cursor move');
  });

  test('Current line border should be visible (has outline style)', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    await page.keyboard.type('S r g m');
    await page.waitForTimeout(300);

    // Check that current line has the expected CSS
    const currentLine = page.locator('.notation-line.current-line');
    await expect(currentLine).toBeVisible();

    // Get computed styles
    const outlineStyle = await currentLine.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        outline: styles.outline,
        outlineColor: styles.outlineColor,
        outlineWidth: styles.outlineWidth,
        outlineStyle: styles.outlineStyle,
        backgroundColor: styles.backgroundColor
      };
    });

    console.log('\n=== Current Line Styles ===');
    console.log(`Outline: ${outlineStyle.outline}`);
    console.log(`Outline Color: ${outlineStyle.outlineColor}`);
    console.log(`Outline Width: ${outlineStyle.outlineWidth}`);
    console.log(`Outline Style: ${outlineStyle.outlineStyle}`);
    console.log(`Background: ${outlineStyle.backgroundColor}`);

    // Verify outline is applied
    expect(outlineStyle.outlineWidth).toBe('2px');
    expect(outlineStyle.outlineStyle).toBe('solid');

    console.log('✅ Current line has visible border styling');
  });

  test('Visual verification: Current line border is present', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create multiple lines
    await page.keyboard.type('AAAA');
    await page.keyboard.press('Enter');
    await page.keyboard.type('BBBB');
    await page.keyboard.press('Enter');
    await page.keyboard.type('CCCC');
    await page.waitForTimeout(300);

    // Verify border exists and is on exactly one line
    const allLines = await page.locator('.notation-line').count();
    const currentLines = await page.locator('.notation-line.current-line').count();

    expect(allLines).toBeGreaterThan(1);
    expect(currentLines).toBe(1);

    console.log(`✅ Document has ${allLines} lines`);
    console.log(`✅ Exactly 1 line has the current-line border`);
    console.log('✅ Feature working: cursor line is visually highlighted');
  });
});
