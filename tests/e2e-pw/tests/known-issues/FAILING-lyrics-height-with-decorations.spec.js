/**
 * FAILING TEST: Lyrics Height Should Not Vary With Decorations
 *
 * This test demonstrates that lines with lyrics have different heights
 * depending on whether they have beat arcs or octave dots.
 *
 * PROBLEM: In src/html_layout/line.rs:918-921, lyrics position is calculated
 * based on the presence of beats/octave dots, adding unnecessary space.
 *
 * EXPECTED: All lines with lyrics should have the same height, regardless
 * of decorations (beats, octave dots, slurs).
 */

import { test, expect } from '@playwright/test';

test.describe('FAILING: Lyrics Height Should Not Vary With Decorations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  async function setLyrics(page, lyricsText) {
    // Open line menu
    const lineMenuButton = page.locator('#line-menu-button');
    await lineMenuButton.click();
    await page.waitForTimeout(100);

    // Click Set Lyrics menu item
    const setLyricsItem = page.locator('#menu-set-lyrics');
    await expect(setLyricsItem).toBeVisible();

    // Handle the prompt dialog
    page.once('dialog', async dialog => {
      await dialog.accept(lyricsText);
    });

    await setLyricsItem.click();
    await page.waitForTimeout(300);
  }

  test('FAILING: Line with lyrics+beats should have SAME height as line with just lyrics', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Notes with lyrics, NO beat grouping (each note is single cell)
    await page.keyboard.type('S r g m');
    await setLyrics(page, 'la la la la');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Line 2: Notes with lyrics AND beat grouping (multi-cell beats create arcs)
    // Notation: 1-- means note 1 extended for 3 cells (creates a beat group)
    await page.keyboard.type('1-- 2- 3--');
    await setLyrics(page, 'do re mi');
    await page.waitForTimeout(300);

    // Get line heights
    const lines = await page.locator('.notation-line').all();

    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const cssHeight1 = parseFloat(style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
    const cssHeight2 = parseFloat(style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    console.log(`\nLine 1 (lyrics, no beats): ${cssHeight1}px`);
    console.log(`Line 2 (lyrics + beats):   ${cssHeight2}px`);

    if (cssHeight2 > cssHeight1) {
      const diff = cssHeight2 - cssHeight1;
      console.log(`\n❌ FAILING: Line 2 reserves ${diff}px extra for beat arcs`);
      console.log(`   This is the bug in src/html_layout/line.rs:918-919`);
    }

    // THIS SHOULD FAIL - Line 2 will be 7px taller due to beat arc reservation
    expect(cssHeight1).toBe(cssHeight2);
  });

  test('FAILING: Line with lyrics+octave dots should have SAME height as line with just lyrics', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Notes with lyrics, NO octave dots
    await page.keyboard.type('S r g m');
    await setLyrics(page, 'la la la la');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Line 2: Notes with lyrics AND octave dots
    await page.keyboard.type('S. r. g. m.');
    await setLyrics(page, 'do re mi fa');
    await page.waitForTimeout(300);

    // Get line heights
    const lines = await page.locator('.notation-line').all();

    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const cssHeight1 = parseFloat(style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
    const cssHeight2 = parseFloat(style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    console.log(`\nLine 1 (lyrics, no dots): ${cssHeight1}px`);
    console.log(`Line 2 (lyrics + dots):   ${cssHeight2}px`);

    if (cssHeight2 > cssHeight1) {
      const diff = cssHeight2 - cssHeight1;
      console.log(`\n❌ FAILING: Line 2 reserves ${diff}px extra for octave dots`);
      console.log(`   This is the bug in src/html_layout/line.rs:920-921`);
    }

    // THIS SHOULD FAIL - Line 2 will be ~7px taller due to octave dot reservation
    expect(cssHeight1).toBe(cssHeight2);
  });

  test('COMPREHENSIVE: All lines with lyrics should have identical height', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Lyrics only, no beats (baseline - single cell per note)
    await page.keyboard.type('S r g');
    await setLyrics(page, 'la la la');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 2: Lyrics + beat arcs (multi-cell beats)
    await page.keyboard.type('1-- 2- 3-');
    await setLyrics(page, 'do re mi');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 3: Lyrics + octave dots
    await page.keyboard.type('P. d. n.');
    await setLyrics(page, 'sa re ga');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 4: Lyrics + slur (slurs should NOT affect height - already correct)
    await page.keyboard.type('m P d');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S'); // Apply slur
    await page.keyboard.press('End');
    await setLyrics(page, 'ma pa da');

    await page.waitForTimeout(500);

    // Get all line heights
    const lines = await page.locator('.notation-line').all();

    console.log('\n=== LINE HEIGHTS WITH LYRICS ===');
    const heights = [];
    for (let i = 0; i < lines.length; i++) {
      const style = await lines[i].getAttribute('style');
      const cssHeight = parseFloat(style?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
      heights.push(cssHeight);
      console.log(`Line ${i}: ${cssHeight}px`);
    }

    // Check if all heights are the same
    const baseHeight = heights[0];
    const allSame = heights.every(h => h === baseHeight);

    if (!allSame) {
      console.log('\n❌ FAILING: Heights are inconsistent:');
      console.log(`   Expected all to be: ${baseHeight}px`);
      console.log(`   Actual heights: ${heights.join(', ')}px`);
      console.log('\n   Root cause: src/html_layout/line.rs:918-921');
      console.log('   Fix: Remove beat/octave dot height from lyrics_y calculation');
    }

    // THIS SHOULD FAIL
    expect(allSame).toBe(true);

    // Verify all heights match baseline
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBe(baseHeight);
    }
  });

  test('SPACE SAVINGS: Calculate wasted space with current implementation', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 10 lines with lyrics and multi-cell beats (creates beat arcs)
    for (let i = 0; i < 10; i++) {
      await page.keyboard.type('1-- 2- 3--');
      await setLyrics(page, 'do re mi');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
    }

    await page.waitForTimeout(500);

    // Get total height
    const lines = await page.locator('.notation-line').all();
    let totalHeight = 0;
    let avgHeight = 0;

    for (const line of lines) {
      const style = await line.getAttribute('style');
      const height = parseFloat(style?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
      totalHeight += height;
    }

    avgHeight = totalHeight / lines.length;

    console.log('\n=== SPACE WASTE CALCULATION ===');
    console.log(`Lines with lyrics+beats: ${lines.length}`);
    console.log(`Average height: ${avgHeight.toFixed(1)}px`);
    console.log(`Total height: ${totalHeight}px`);
    console.log('\nIf beat arc reservation (7px) was removed:');
    console.log(`  Reduced height per line: ${(avgHeight - 7).toFixed(1)}px`);
    console.log(`  Total height saved: ${lines.length * 7}px`);
    console.log(`  Space savings: ${((lines.length * 7) / totalHeight * 100).toFixed(1)}%`);
    console.log('\nFor a document with 100 lines: 700px saved!');
  });
});
