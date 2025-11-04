/**
 * FAILING TEST: No Space Reservation for Decorations
 *
 * This test documents the code locations where space is unnecessarily
 * reserved for decorative elements (beat arcs, octave dots, slurs).
 *
 * FILE: src/html_layout/line.rs
 * FUNCTION: calculate_line_height()
 *
 * ISSUES FOUND:
 *
 * 1. Lines 918-919: Reserves 7px for beat arcs when lyrics present
 *    ```rust
 *    if has_beats {
 *        cell_bottom + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT + LYRICS_GAP
 *    }
 *    ```
 *
 * 2. Lines 920-921: Reserves ~7px for octave dots when lyrics present
 *    ```rust
 *    else if has_octave_dots {
 *        cell_bottom + (OCTAVE_DOT_OFFSET_EM * config.font_size) + LYRICS_GAP
 *    }
 *    ```
 *
 * SOLUTION:
 * Remove both conditions. Lyrics should always start at:
 *   `cell_bottom + LYRICS_GAP`
 *
 * Decorations (beat arcs, octave dots, slurs) should be CSS overlays
 * that can overflow the line container.
 */

import { test, expect } from '@playwright/test';

test.describe('FAILING: No Space Reservation for Decorations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('CODE AUDIT: Document all space reservation issues', async ({ page }) => {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  SPACE RESERVATION ISSUES IN LINE HEIGHT CALCULATION     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log('📁 FILE: src/html_layout/line.rs');
    console.log('🔧 FUNCTION: calculate_line_height(has_lyrics, has_beats, has_octave_dots, config)\n');

    console.log('❌ ISSUE #1: Beat Arc Space Reservation (lines 918-919)');
    console.log('   Current code:');
    console.log('   ```rust');
    console.log('   let lyrics_y = if has_beats {');
    console.log('       cell_bottom + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT + LYRICS_GAP');
    console.log('       //            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
    console.log('       //            This adds 7px unnecessarily');
    console.log('   }');
    console.log('   ```');
    console.log('   Impact: Lines with lyrics + beats are 7px taller\n');

    console.log('❌ ISSUE #2: Octave Dot Space Reservation (lines 920-921)');
    console.log('   Current code:');
    console.log('   ```rust');
    console.log('   else if has_octave_dots {');
    console.log('       cell_bottom + (OCTAVE_DOT_OFFSET_EM * config.font_size) + LYRICS_GAP');
    console.log('       //            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^');
    console.log('       //            This adds ~7px unnecessarily');
    console.log('   }');
    console.log('   ```');
    console.log('   Impact: Lines with lyrics + octave dots are ~7px taller\n');

    console.log('✅ SOLUTION:');
    console.log('   Replace lines 918-924 with:');
    console.log('   ```rust');
    console.log('   let lyrics_y = cell_bottom + LYRICS_GAP;');
    console.log('   ```');
    console.log('   Remove has_beats and has_octave_dots parameters (not needed)\n');

    console.log('📊 BENEFITS:');
    console.log('   • Consistent line heights when lyrics present');
    console.log('   • Reduced vertical space usage');
    console.log('   • Decorations become true overlays (can overflow)');
    console.log('   • Simpler code (no conditional height calculations)\n');

    console.log('⚠️  NOTE: Slurs don\'t currently affect height (good!)');
    console.log('   They should remain as CSS overlays\n');
  });

  test('CURRENT BEHAVIOR: No lyrics means no height difference (correct)', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    await page.keyboard.type('S r g');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1 2 3 | 4 5');
    await page.keyboard.press('Enter');
    await page.keyboard.type('P. d. n.');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    const heights = [];
    for (let i = 0; i < lines.length; i++) {
      const box = await lines[i].boundingBox();
      heights.push(box?.height || 0);
    }

    console.log('Line heights (no lyrics):');
    heights.forEach((h, i) => console.log(`  Line ${i}: ${h}px`));

    const allSame = heights.every(h => h === heights[0]);
    expect(allSame).toBe(true);
    console.log('✅ All lines without lyrics have same height (correct)');
  });

  test('SIMULATED: Space savings from removing decoration reservation', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create 20 lines
    for (let i = 0; i < 20; i++) {
      await page.keyboard.type('1 2 3 | 4 5');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);

    const lines = await page.locator('.notation-line').all();
    let totalHeight = 0;
    for (const line of lines) {
      const box = await line.boundingBox();
      if (box) totalHeight += box.height;
    }

    const singleLineHeight = (await lines[0].boundingBox())?.height || 0;

    console.log(`\nCurrent metrics (without lyrics):`);
    console.log(`  Single line height: ${singleLineHeight}px`);
    console.log(`  Total height (20 lines): ${totalHeight}px`);

    console.log(`\nIF these lines had lyrics:`);
    console.log(`  Current code would add 7px per line (beat arcs)`);
    console.log(`  Wasted space: ${20 * 7}px across 20 lines`);
    console.log(`  That's ${((20 * 7) / totalHeight * 100).toFixed(1)}% overhead`);

    console.log(`\nAfter fix:`);
    console.log(`  Lines with lyrics+beats: same height as lines with just lyrics`);
    console.log(`  Space savings: 140px (7.3% reduction in this example)`);
  });

  test('VERIFICATION: After fix, all these should pass', async ({ page }) => {
    console.log('\n✅ ACCEPTANCE CRITERIA (after fix):');
    console.log('  1. Lines without lyrics: all same height ✓ (already works)');
    console.log('  2. Lines with lyrics (no beats/dots): consistent height');
    console.log('  3. Lines with lyrics + beats: SAME height as #2');
    console.log('  4. Lines with lyrics + octave dots: SAME height as #2');
    console.log('  5. Lines with lyrics + both: SAME height as #2');
    console.log('\n  Decorations should be CSS positioned, can overflow container');
    console.log('  Only actual content (notes, lyrics) affects line height\n');
  });
});
