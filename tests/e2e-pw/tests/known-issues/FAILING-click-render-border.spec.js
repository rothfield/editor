/**
 * FAILING TEST: Click Should Trigger Render to Update Border
 *
 * The root issue: Clicking on a line updates cursor position but does NOT
 * trigger a render, so the .current-line class doesn't update.
 *
 * These tests demonstrate that the border only updates when render() is called.
 */

import { test, expect } from '@playwright/test';

test.describe('FAILING: Click Must Trigger Render for Border Update', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('FAILING: Border stuck on last rendered line after click', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 3 lines (last render happens here)
    await page.keyboard.type('AAA');
    await page.keyboard.press('Enter');
    await page.keyboard.type('BBB');
    await page.keyboard.press('Enter');
    await page.keyboard.type('CCC'); // Cursor on line 2, border on line 2
    await page.waitForTimeout(300);

    // Verify border is on line 2 (where cursor is after typing)
    let currentLine = page.locator('.notation-line.current-line');
    let lineIndex = await currentLine.getAttribute('data-line');
    console.log(`After typing, border on line: ${lineIndex}`);
    expect(lineIndex).toBe('2'); // ✓ This works

    const lines = await page.locator('.notation-line').all();

    // Click on line 0
    await lines[0].click();
    await page.waitForTimeout(300);

    // Check border position
    currentLine = page.locator('.notation-line.current-line');
    lineIndex = await currentLine.getAttribute('data-line');

    console.log(`After clicking line 0, border on line: ${lineIndex}`);
    console.log(`❌ PROBLEM: Border stuck on line ${lineIndex}, should be on line 0`);
    console.log(`   Reason: Click updated cursor but didn't trigger render()`);

    // THIS FAILS - border should move to line 0
    expect(lineIndex).toBe('0');
  });

  test('FAILING: Typing triggers render and updates border, clicking does not', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create lines
    await page.keyboard.type('Line 0');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Line 2');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Border on line 2 (from typing)
    let currentLine = page.locator('.notation-line.current-line');
    let lineIndex = await currentLine.getAttribute('data-line');
    console.log(`After typing, border on: ${lineIndex}`);
    expect(lineIndex).toBe('2');

    // Click on line 0 - does NOT update border
    await lines[0].click();
    await page.waitForTimeout(300);

    currentLine = page.locator('.notation-line.current-line');
    lineIndex = await currentLine.getAttribute('data-line');
    console.log(`After clicking line 0, border on: ${lineIndex}`);
    console.log(`❌ Click didn't update border (no render)`);

    // Type a character - DOES update border (triggers render)
    await page.keyboard.type('X');
    await page.waitForTimeout(300);

    currentLine = page.locator('.notation-line.current-line');
    lineIndex = await currentLine.getAttribute('data-line');
    console.log(`After typing on line 0, border on: ${lineIndex}`);
    console.log(`✅ Typing updated border (triggers render)`);

    expect(lineIndex).toBe('0');
  });

  test('FAILING: Multiple clicks show border never updates without render', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 5 lines
    for (let i = 0; i < 5; i++) {
      await page.keyboard.type(`Line ${i}`);
      if (i < 4) await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Border starts on line 4 (where typing ended)
    let currentLine = page.locator('.notation-line.current-line');
    let lineIndex = await currentLine.getAttribute('data-line');
    console.log(`\nInitial border: line ${lineIndex}`);
    expect(lineIndex).toBe('4');

    // Click on each line and check if border moves
    const clickResults = [];

    for (let i = 0; i < 5; i++) {
      await lines[i].click();
      await page.waitForTimeout(200);

      currentLine = page.locator('.notation-line.current-line');
      lineIndex = await currentLine.getAttribute('data-line');

      clickResults.push({
        clicked: i,
        borderOn: parseInt(lineIndex)
      });

      console.log(`Clicked line ${i}, border on: ${lineIndex}`);
    }

    console.log('\n=== CLICK RESULTS ===');
    clickResults.forEach(r => {
      const status = r.clicked === r.borderOn ? '✓' : '✗';
      console.log(`${status} Clicked ${r.clicked} → Border ${r.borderOn}`);
    });

    // All clicks should have moved the border
    const allCorrect = clickResults.every(r => r.clicked === r.borderOn);
    console.log(`\n❌ All correct: ${allCorrect}`);
    console.log(`   Expected: All clicks update border`);
    console.log(`   Actual: Border stuck on last render position`);

    expect(allCorrect).toBe(true);
  });

  test('FAILING: Cursor position updates but visual border does not', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create lines
    await page.keyboard.type('First');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Third');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Click on line 0
    await lines[0].click();
    await page.waitForTimeout(300);

    // Check cursor position in JavaScript
    const cursorPosition = await page.evaluate(() => {
      return {
        line: window.musicEditor?.theDocument?.state?.cursor?.line,
        col: window.musicEditor?.theDocument?.state?.cursor?.col
      };
    });

    console.log(`\nAfter clicking line 0:`);
    console.log(`  Cursor position (JS): line ${cursorPosition.line}`);

    // Check visual border position
    const currentLine = page.locator('.notation-line.current-line');
    const visualLineIndex = await currentLine.getAttribute('data-line');

    console.log(`  Visual border (DOM): line ${visualLineIndex}`);

    // Cursor position and visual border should match
    console.log(`\n❌ MISMATCH:`);
    console.log(`   Cursor.line = ${cursorPosition.line} (correct)`);
    console.log(`   Border line = ${visualLineIndex} (stale)`);
    console.log(`   Problem: Click updated cursor but not visual border`);

    expect(cursorPosition.line.toString()).toBe(visualLineIndex);
  });

  test('DOCUMENTATION: Root cause and fix needed', async ({ page }) => {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ROOT CAUSE: Click Does Not Trigger Render            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('CURRENT BEHAVIOR:');
    console.log('  1. User clicks on line 0');
    console.log('  2. MouseHandler updates cursor position in JS');
    console.log('  3. theDocument.state.cursor.line = 0  ✓');
    console.log('  4. BUT: render() is NOT called  ✗');
    console.log('  5. Border stays on old line (stale)  ✗\n');

    console.log('EXPECTED BEHAVIOR:');
    console.log('  1. User clicks on line 0');
    console.log('  2. MouseHandler updates cursor position');
    console.log('  3. theDocument.state.cursor.line = 0  ✓');
    console.log('  4. MouseHandler calls editor.render()  ← MISSING');
    console.log('  5. render() calls renderLineFromDisplayList()');
    console.log('  6. renderLineFromDisplayList() checks cursor.line');
    console.log('  7. Line 0 gets .current-line class');
    console.log('  8. Border appears on line 0  ✓\n');

    console.log('FIX REQUIRED:');
    console.log('  File: src/js/handlers/MouseHandler.js');
    console.log('  Location: After setting cursor position on click');
    console.log('  Add: await this.editor.render();');
    console.log('  Or: await this.editor.renderAndUpdate();\n');

    console.log('SIMILAR PATTERN:');
    console.log('  Typing already calls render() after each keystroke');
    console.log('  Click should do the same after updating cursor\n');

    console.log('════════════════════════════════════════════════════════\n');
  });
});
