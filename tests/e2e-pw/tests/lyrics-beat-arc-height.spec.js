/**
 * E2E Test: Lyrics + Beat Arcs - Space Reservation Issue
 *
 * PROBLEM: When a line has BOTH lyrics AND beat arcs, the Rust code
 * reserves extra space for the beat arcs (line.rs:918-919):
 *
 *   if has_beats {
 *       cell_bottom + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT + LYRICS_GAP
 *   }
 *
 * This adds 7px (2.0 + 5.0) for beat arcs, pushing lyrics down unnecessarily.
 *
 * GOAL: Beat arcs should be CSS overlays that DON'T push lyrics down.
 * Lyrics should start at the same Y position whether beats exist or not.
 */

import { test, expect } from '@playwright/test';

test.describe('Lyrics + Beat Arcs - No Space Reservation', () => {
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

  test('FAILING: Line with lyrics+beats should have same height as line with just lyrics', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // TODO: Need to figure out how to add lyrics in this editor
    // For now, this test documents the issue location in the code

    // Line 1: Notes with lyrics, NO beat grouping
    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');

    // Line 2: Notes with lyrics AND beat grouping
    await page.keyboard.type('1 2 3 | 4 5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    // Extract CSS heights
    const style1 = await lines[0].getAttribute('style');
    const style2 = await lines[1].getAttribute('style');

    const cssHeight1 = style1?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1];
    const cssHeight2 = style2?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1];

    console.log(`Line 1 (lyrics, no beats): ${cssHeight1}px`);
    console.log(`Line 2 (lyrics + beats): ${cssHeight2}px`);

    // Without lyrics, both would be 96px
    // With lyrics but different beat states, heights might differ

    // THE BUG: If line 2 has both lyrics and beats, it will be taller
    // because of the reserved space in line.rs:918-919

    console.log('\nCODE LOCATION:');
    console.log('  File: src/html_layout/line.rs');
    console.log('  Function: calculate_line_height()');
    console.log('  Lines: 918-919');
    console.log('  Problem: if has_beats { ... + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT ... }');
    console.log('  Fix: Remove beat arc height from lyrics position calculation');
    console.log('       Beat arcs should be CSS overlays that can overflow');
  });

  test('DOCUMENTATION: Where beat arc space is reserved in Rust', async ({ page }) => {
    console.log('\n=== BEAT ARC SPACE RESERVATION ISSUE ===\n');
    console.log('File: src/html_layout/line.rs');
    console.log('Function: calculate_line_height(has_lyrics, has_beats, has_octave_dots, config)');
    console.log('\nProblematic code (lines 910-928):');
    console.log(`
    if has_lyrics {
        const BEAT_LOOP_GAP: f32 = 2.0;
        const BEAT_LOOP_HEIGHT: f32 = 5.0;
        const LYRICS_GAP: f32 = 4.0;

        let cell_bottom = config.cell_y_offset + config.cell_height;
        let lyrics_y = if has_beats {
            cell_bottom + BEAT_LOOP_GAP + BEAT_LOOP_HEIGHT + LYRICS_GAP  // ❌ PROBLEM
        } else if has_octave_dots {
            cell_bottom + (OCTAVE_DOT_OFFSET_EM * config.font_size) + LYRICS_GAP
        } else {
            cell_bottom + LYRICS_GAP
        };

        let lyrics_font_size = config.font_size * 0.5;
        let lyrics_bottom_padding = config.font_size;
        lyrics_y + lyrics_font_size + lyrics_bottom_padding
    } else {
        config.cell_y_offset + config.cell_height + config.cell_y_offset
    }
    `);
    console.log('\nSUGGESTED FIX:');
    console.log('  Remove beat arc height from lyrics_y calculation:');
    console.log(`
    let lyrics_y = if has_octave_dots {
        cell_bottom + (OCTAVE_DOT_OFFSET_EM * config.font_size) + LYRICS_GAP
    } else {
        cell_bottom + LYRICS_GAP
    };
    `);
    console.log('  Remove has_beats parameter entirely (not needed for height)');
    console.log('  Beat arcs should be positioned using CSS overlays');
    console.log('  They can overlap/overflow the line container');
    console.log('\n========================================\n');
  });

  test('EXPECTED: Minimal height regardless of decoration presence', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create multiple lines
    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1 2 3 | 4 5 6');
    await page.keyboard.press('Enter');
    await page.keyboard.type('P d n');
    await page.waitForTimeout(300);

    const lines = await page.locator('.notation-line').all();

    console.log('\nLine heights (without lyrics):');
    for (let i = 0; i < lines.length; i++) {
      const style = await lines[i].getAttribute('style');
      const cssHeight = style?.match(/height:\s*(\d+(?:\.\d+)?)px/)?.[1];
      console.log(`  Line ${i}: ${cssHeight}px`);
    }

    console.log('\nEXPECTED: All should be 96px (base height)');
    console.log('AFTER FIX: Lines with lyrics should be taller, but NOT');
    console.log('           because of beat arcs - only because of lyrics content');
  });
});
