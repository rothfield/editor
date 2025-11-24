import { test, expect } from '@playwright/test';

/**
 * Test: Beat arc drawing should NOT include breath marks when counting beat elements
 *
 * Bug: Input "'1" (breath mark + single pitch) incorrectly draws a beat arc
 *
 * Root cause: src/html_layout/line.rs:401-427 in compute_beat_loop_arcs()
 * Current logic:
 *   let cell_count = (beat.start..=beat.end).count();  // Counts ALL cells
 *   if cell_count >= 2 { draw_arc() }
 *
 * Problem: Breath marks are beat elements but NOT rhythmic elements
 * - Beat grouping includes breath marks (correct for phrase boundaries)
 * - Arc drawing should exclude breath marks (only count pitched/unpitched)
 *
 * Expected fix:
 *   let rhythm_element_count = (beat.start..=beat.end)
 *       .filter(|&idx| matches!(cell.kind, PitchedElement | UnpitchedElement))
 *       .count();
 *   if rhythm_element_count >= 2 { draw_arc() }
 */

test.describe('Breath mark arc drawing bug', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('breath mark with single note should have no arc', async ({ page }) => {
    // Type: "'1" (breath mark + single pitch)
    await page.keyboard.type("'1");

    // Wait for rendering
    await page.waitForTimeout(100);

    // Verify both cells exist in the document
    const notationLine = page.locator('.notation-line').first();
    const breathMark = notationLine.locator('.kind-breath');
    const pitchedCell = notationLine.locator('.kind-pitched');

    await expect(breathMark).toHaveCount(1, 'Should have 1 breath mark cell');
    await expect(pitchedCell).toHaveCount(1, 'Should have 1 pitched element cell');

    // FIXED: Breath marks are no longer counted as rhythmic elements
    // Expected: 0 arcs (only 1 rhythmic element)
    // The fix correctly excludes breath marks when counting rhythmic elements
    const beatArcs = page.locator('#beat-loops path');
    await expect(beatArcs).toHaveCount(0,
      'Beat with single rhythmic element should NOT have arc (breath mark is not rhythmic)');
  });

  test('breath mark with TWO notes should have arc (control test)', async ({ page }) => {
    // Type: "'12" (breath mark + two pitches)
    await page.keyboard.type("'12");

    await page.waitForTimeout(100);

    // Verify cells
    const notationLine = page.locator('.notation-line').first();
    const breathMark = notationLine.locator('.kind-breath');
    const pitchedCells = notationLine.locator('.kind-pitched');

    await expect(breathMark).toHaveCount(1);
    await expect(pitchedCells).toHaveCount(2, 'Should have 2 pitched elements');

    // This SHOULD pass: 2 rhythmic elements → draw arc
    const beatArcs = page.locator('#beat-loops path');
    await expect(beatArcs).toHaveCount(1,
      'Beat with 2 rhythmic elements SHOULD have arc');
  });

  test('breath mark in second beat (space-separated) should have no arc', async ({ page }) => {
    // Type: "1 '2" (single pitch, space, breath mark + single pitch)
    await page.keyboard.type("1 '2");

    await page.waitForTimeout(100);

    // Verify structure
    const notationLine = page.locator('.notation-line').first();
    const pitchedCells = notationLine.locator('.kind-pitched');
    const breathMark = notationLine.locator('.kind-breath');

    await expect(pitchedCells).toHaveCount(2, 'Should have 2 pitched elements');
    await expect(breathMark).toHaveCount(1, 'Should have 1 breath mark');

    // Each beat has only 1 rhythmic element → no arcs
    const beatArcs = page.locator('#beat-loops path');
    await expect(beatArcs).toHaveCount(0,
      'Two single-element beats (separated by space) should have no arcs');
  });

  test('breath mark between two notes should have arc', async ({ page }) => {
    // Type: "1'2" (pitch, breath mark, pitch)
    await page.keyboard.type("1'2");

    await page.waitForTimeout(100);

    // Verify structure
    const notationLine = page.locator('.notation-line').first();
    const pitchedCells = notationLine.locator('.kind-pitched');
    const breathMark = notationLine.locator('.kind-breath');

    await expect(pitchedCells).toHaveCount(2);
    await expect(breathMark).toHaveCount(1);

    // 2 rhythmic elements in same beat → should have arc
    const beatArcs = page.locator('#beat-loops path');
    await expect(beatArcs).toHaveCount(1,
      'Beat with 2 rhythmic elements (breath mark between) SHOULD have arc');
  });

  test('single pitch with trailing space should have no arc (baseline)', async ({ page }) => {
    // Type: "1 " (single pitch + space)
    await page.keyboard.type('1 ');

    await page.waitForTimeout(100);

    // Single element beat → no arc (this should already pass)
    const beatArcs = page.locator('#beat-loops path');
    await expect(beatArcs).toHaveCount(0,
      'Single pitched element with no breath mark should have no arc (baseline)');
  });
});
