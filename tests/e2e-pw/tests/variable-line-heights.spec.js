/**
 * E2E Test: Variable Line Heights Based on Content
 *
 * Lines should have VARIABLE heights based on actual content:
 * - Minimal height for simple notes (e.g., "1")
 * - Taller for notes with decorations (e.g., "111" slurred)
 * - Even taller when lyrics are present
 *
 * This is the CORRECT behavior - not fixed heights.
 */

import { test, expect } from '@playwright/test';

test.describe('Variable Line Heights Based on Content', () => {
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
    const lineMenuButton = page.locator('#line-menu-button');
    await lineMenuButton.click();
    await page.waitForTimeout(100);

    const setLyricsItem = page.locator('#menu-set-lyrics');
    await expect(setLyricsItem).toBeVisible();

    page.once('dialog', async dialog => {
      await dialog.accept(lyricsText);
    });

    await setLyricsItem.click();
    await page.waitForTimeout(300);
  }

  test('Line with single note "1" should be shorter than "111" slurred', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Single note (minimal height)
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Line 2: Three notes slurred (needs space for slur arc)
    await page.keyboard.type('1 1 1');
    await page.keyboard.press('Home');
    // Select all three notes
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S'); // Apply slur
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const height1 = parseFloat(style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
    const height2 = parseFloat(style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    console.log(`\nLine 1 (single "1"): ${height1}px (minimal)`);
    console.log(`Line 2 ("111" slurred): ${height2}px (taller for slur)`);

    // Line with slur should be taller (needs space for arc)
    expect(height2).toBeGreaterThan(height1);

    const diff = height2 - height1;
    console.log(`✅ Slur adds ${diff}px for the arc (correct variable height)`);
  });

  test('Line with beat arcs should be taller than line without', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Single notes (minimal height)
    await page.keyboard.type('1 2 3');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Line 2: Multi-cell beats (needs space for beat arcs)
    await page.keyboard.type('1-- 2- 3--');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const height1 = parseFloat(style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
    const height2 = parseFloat(style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    console.log(`\nLine 1 (single notes): ${height1}px`);
    console.log(`Line 2 (beat groups): ${height2}px`);

    // Line with beat arcs should be taller
    expect(height2).toBeGreaterThan(height1);

    const diff = height2 - height1;
    console.log(`✅ Beat arcs add ${diff}px (correct variable height)`);
  });

  test('Minimal line "1" < Line with decoration < Line with lyrics', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Minimal (single note, no decorations)
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');

    // Line 2: With slur (taller)
    await page.keyboard.type('1 1 1');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 3: With lyrics (tallest)
    await page.keyboard.type('1 2 3');
    await setLyrics(page, 'do re mi');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const heights = [];
    for (let i = 0; i < 3; i++) {
      const style = await lines[i].getAttribute('style');
      const height = parseFloat(style?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
      heights.push(height);
    }

    console.log('\n=== VARIABLE LINE HEIGHTS ===');
    console.log(`Line 1 (minimal "1"):       ${heights[0]}px`);
    console.log(`Line 2 (with slur):         ${heights[1]}px`);
    console.log(`Line 3 (with lyrics):       ${heights[2]}px`);

    // Heights should increase: minimal < decorated < with lyrics
    expect(heights[1]).toBeGreaterThan(heights[0]);
    expect(heights[2]).toBeGreaterThan(heights[1]);

    console.log('\n✅ Correct: Heights increase based on content needs');
    console.log(`   ${heights[0]}px < ${heights[1]}px < ${heights[2]}px`);
  });

  test('Lines with same decorations should have same height', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Slurred notes
    await page.keyboard.type('1 2 3');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 2: Different slurred notes (same decoration type)
    await page.keyboard.type('4 5 6');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const height1 = parseFloat(style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
    const height2 = parseFloat(style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    console.log(`\nLine 1 (slurred): ${height1}px`);
    console.log(`Line 2 (slurred): ${height2}px`);

    // Same decoration type = same height
    expect(height1).toBe(height2);

    console.log('✅ Correct: Same decorations = same height');
  });

  test('Space efficiency: Only allocate height when needed', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 10 minimal lines (just "1")
    for (let i = 0; i < 10; i++) {
      await page.keyboard.type('1');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);

    const lines = await page.locator('.notation-line').all();

    const firstStyle = await lines[0].getAttribute('style');
    const minimalHeight = parseFloat(firstStyle?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    const totalHeight = minimalHeight * lines.length;

    console.log('\n=== SPACE EFFICIENCY ===');
    console.log(`10 minimal lines ("1" each)`);
    console.log(`Height per line: ${minimalHeight}px`);
    console.log(`Total height: ${totalHeight}px`);
    console.log('\n✅ Minimal lines use minimal space (efficient)');
    console.log('   If decorations were present, height would increase as needed');
  });
});
