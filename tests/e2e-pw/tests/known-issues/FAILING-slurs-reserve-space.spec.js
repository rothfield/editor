/**
 * FAILING TEST: Slurs Should Not Reserve Space
 *
 * Tests whether slurs cause line height differences (they shouldn't).
 * Slurs should be CSS overlays that don't affect line height.
 */

import { test, expect } from '@playwright/test';

test.describe('FAILING: Slurs Should Not Reserve Space', () => {
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

  test('FAILING: Line with slurs (no lyrics) should have same height as line without slurs', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Simple notes, no slurs
    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Line 2: Notes with slur
    await page.keyboard.type('P d n');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S'); // Apply slur
    await page.keyboard.press('End');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const cssHeight1 = parseFloat(style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
    const cssHeight2 = parseFloat(style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    console.log(`\nLine 1 (no slurs):  ${cssHeight1}px`);
    console.log(`Line 2 (with slur): ${cssHeight2}px`);

    if (cssHeight2 > cssHeight1) {
      const diff = cssHeight2 - cssHeight1;
      console.log(`\n❌ FAILING: Line 2 reserves ${diff}px extra for slurs`);
      console.log(`   Slurs should be CSS overlays that don't affect line height`);
    } else if (cssHeight1 === cssHeight2) {
      console.log(`\n✅ PASSING: Slurs don't affect height (correct behavior)`);
    }

    // Lines without lyrics should have same height regardless of slurs
    expect(cssHeight1).toBe(cssHeight2);
  });

  test('FAILING: Line with lyrics+slurs should have same height as line with just lyrics', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Notes with lyrics, NO slurs
    await page.keyboard.type('S r g m');
    await setLyrics(page, 'la la la la');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Line 2: Notes with lyrics AND slurs
    await page.keyboard.type('P d n');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S'); // Apply slur
    await page.keyboard.press('End');
    await setLyrics(page, 'ma pa da');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const cssHeight1 = parseFloat(style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
    const cssHeight2 = parseFloat(style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');

    console.log(`\nLine 1 (lyrics, no slurs):  ${cssHeight1}px`);
    console.log(`Line 2 (lyrics + slurs):    ${cssHeight2}px`);

    if (cssHeight2 > cssHeight1) {
      const diff = cssHeight2 - cssHeight1;
      console.log(`\n❌ FAILING: Line 2 reserves ${diff}px extra for slurs`);
      console.log(`   Slurs should be CSS overlays that don't affect line height`);
    } else if (cssHeight1 === cssHeight2) {
      console.log(`\n✅ PASSING: Slurs don't affect height with lyrics (correct behavior)`);
    }

    // Lines with lyrics should have same height regardless of slurs
    expect(cssHeight1).toBe(cssHeight2);
  });

  test('COMPREHENSIVE: Test all decoration combinations', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Line 1: Baseline (lyrics only, no decorations)
    await page.keyboard.type('S r g');
    await setLyrics(page, 'la la la');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 2: Lyrics + beat arcs
    await page.keyboard.type('1-- 2-');
    await setLyrics(page, 'do re');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 3: Lyrics + slurs
    await page.keyboard.type('m P d');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.keyboard.press('End');
    await setLyrics(page, 'ma pa da');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 4: Lyrics + octave dots
    await page.keyboard.type('S. r. g.');
    await setLyrics(page, 'sa re ga');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Line 5: Lyrics + beat arcs + slurs
    await page.keyboard.type('1-- 2-');
    await page.keyboard.press('Home');
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+S');
    await page.keyboard.press('End');
    await setLyrics(page, 'ni dha');
    await page.waitForTimeout(500);

    const lines = await page.locator('.notation-line').all();

    console.log('\n=== ALL DECORATION COMBINATIONS ===');
    const heights = [];
    const descriptions = [
      'Baseline (lyrics only)',
      'Lyrics + beat arcs',
      'Lyrics + slurs',
      'Lyrics + octave dots',
      'Lyrics + beats + slurs'
    ];

    for (let i = 0; i < Math.min(lines.length, descriptions.length); i++) {
      const style = await lines[i].getAttribute('style');
      const cssHeight = parseFloat(style?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1] || '0');
      heights.push(cssHeight);
      console.log(`Line ${i} (${descriptions[i]}): ${cssHeight}px`);
    }

    const baseHeight = heights[0];
    const differences = heights.map((h, i) => ({
      line: i,
      description: descriptions[i],
      height: h,
      diff: h - baseHeight
    }));

    console.log('\n=== HEIGHT DIFFERENCES FROM BASELINE ===');
    differences.forEach(d => {
      if (d.diff > 0) {
        console.log(`❌ Line ${d.line} (${d.description}): +${d.diff}px`);
      } else if (d.diff === 0) {
        console.log(`✅ Line ${d.line} (${d.description}): same height`);
      }
    });

    // Check which decorations cause height issues
    const allSame = heights.every(h => h === baseHeight);

    if (!allSame) {
      console.log('\n❌ FAILING: Decorations are reserving space');
      console.log('   Expected: All lines should have same height');
      console.log(`   Baseline: ${baseHeight}px`);
    }

    expect(allSame).toBe(true);
  });
});
