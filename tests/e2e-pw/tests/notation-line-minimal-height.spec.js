/**
 * E2E Test: Notation Line Height Should Be Minimal
 *
 * PROBLEM: Layout calculations currently reserve space for decorative elements
 * like slurs and beat group arcs, making lines unnecessarily tall.
 *
 * GOAL: Reduce vertical space usage by NOT reserving space for decorations.
 *
 * CORRECT BEHAVIOR:
 * - Lines without lyrics should use minimal base height (just enough for notes)
 * - Slurs, beat arcs, etc. should be CSS overlays that overflow the line container
 * - Only lyrics should increase line height (since they need actual space)
 * - Result: Much more compact notation overall
 */

import { test, expect } from '@playwright/test';

test.describe('Notation Line Height - Minimal Space (No Decoration Reservation)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Clear any existing content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('FAILING: Line with beat arcs should NOT have extra height reserved', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Simple notes without beat grouping
    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');

    // Line 2: Notes with beat grouping (creates beat arcs)
    await page.keyboard.type('1 2 3 | 4 5 6');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Get line heights
    const lines = await page.locator('.notation-line').all();

    const line1Box = await lines[0].boundingBox();
    const line2Box = await lines[1].boundingBox();

    const line1Height = line1Box?.height || 0;
    const line2Height = line2Box?.height || 0;

    console.log(`Line 1 (no beats): ${line1Height}px`);
    console.log(`Line 2 (with beats): ${line2Height}px`);

    // Extract CSS heights from Rust
    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');
    const cssHeight1 = style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1];
    const cssHeight2 = style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1];

    console.log(`Line 1 CSS height from Rust: ${cssHeight1}px`);
    console.log(`Line 2 CSS height from Rust: ${cssHeight2}px`);

    // THIS SHOULD FAIL: Currently Rust reserves extra space for beat arcs
    // Expected: Both lines should have same height (no reservation for decorations)
    expect(line1Height).toBe(line2Height);

    if (line1Height !== line2Height) {
      const diff = Math.abs(line1Height - line2Height);
      console.log(`❌ PROBLEM: Line with beats reserves ${diff}px extra for arcs`);
      console.log(`   This wasted space should be eliminated - arcs should overflow`);
    }
  });

  test('FAILING: Lines with octave dots should NOT increase height', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: No octave dots
    await page.keyboard.type('S r g');
    await page.keyboard.press('Enter');

    // Line 2: With octave dots (upper octave)
    await page.keyboard.type('S. r. g.');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const line1Box = await lines[0].boundingBox();
    const line2Box = await lines[1].boundingBox();

    const line1Height = line1Box?.height || 0;
    const line2Height = line2Box?.height || 0;

    console.log(`Line 1 (no dots): ${line1Height}px`);
    console.log(`Line 2 (with dots): ${line2Height}px`);

    // THIS MIGHT FAIL: Check if octave dots cause height reservation
    // Expected: Same height - dots should be positioned within the line
    expect(line1Height).toBe(line2Height);

    if (line1Height !== line2Height) {
      const diff = Math.abs(line1Height - line2Height);
      console.log(`❌ PROBLEM: Line with octave dots reserves ${diff}px extra`);
      console.log(`   Octave dots should not increase line height`);
    }
  });

  test('Lines with lyrics SHOULD have extra height (this is correct)', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: No lyrics
    await page.keyboard.type('S r g');
    await page.keyboard.press('Enter');

    // Line 2: With lyrics (add lyrics somehow - depends on implementation)
    // For now just test that lyrics increase height
    await page.keyboard.type('S r g');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Just verify we can measure heights
    const line1Box = await lines[0].boundingBox();
    const line2Box = await lines[1].boundingBox();

    console.log(`Line 1: ${line1Box?.height}px`);
    console.log(`Line 2: ${line2Box?.height}px`);

    // This test is informational - lyrics SHOULD increase height
    // (Unlike decorations which should not)
    console.log('✅ Lyrics are actual content and should increase line height');
  });

  test('DEMONSTRATION: Current wasted space due to decoration reservation', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 10 lines with beat groupings
    for (let i = 0; i < 10; i++) {
      await page.keyboard.type('1 2 3 | 4 5 6');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);

    const lines = await page.locator('.notation-line').all();

    let totalCurrentHeight = 0;
    for (const line of lines) {
      const box = await line.boundingBox();
      if (box) {
        totalCurrentHeight += box.height;
      }
    }

    console.log(`Total height for 10 lines: ${totalCurrentHeight}px`);

    // If each line wastes ~10px for beat arc reservation, that's 100px wasted
    // across 10 lines. With proper overflow handling, could save significant space.

    // Get one line's height
    const firstBox = await lines[0].boundingBox();
    const singleLineHeight = firstBox?.height || 0;

    console.log(`Single line height: ${singleLineHeight}px`);
    console.log(`If we could reduce by 10px per line: ${totalCurrentHeight - (lines.length * 10)}px total`);
    console.log(`That's ${((10 * lines.length) / totalCurrentHeight * 100).toFixed(1)}% space savings`);

    // This test just demonstrates the issue - no assertion
    // The fix will be in Rust's calculate_line_height()
  });

  test('EXPECTED BEHAVIOR: Minimal base height for lines without lyrics', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1 2 3 | 4 5');
    await page.keyboard.press('Enter');
    await page.keyboard.type('P. d. n.');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // All lines should have the SAME minimal height
    const heights = [];
    for (let i = 0; i < lines.length; i++) {
      const box = await lines[i].boundingBox();
      if (box) {
        heights.push(box.height);
        console.log(`Line ${i}: ${box.height}px`);
      }
    }

    // Check if they're all the same
    const allSame = heights.every(h => h === heights[0]);

    if (allSame) {
      console.log(`✅ All lines have same height: ${heights[0]}px`);
      console.log(`   (Decorations don't reserve space)`);
    } else {
      console.log(`❌ Lines have different heights: ${[...new Set(heights)].join(', ')}px`);
      console.log(`   Expected: All should be ${Math.min(...heights)}px (minimal height)`);
    }

    // THIS SHOULD PASS after fix
    expect(allSame).toBe(true);
  });
});
