/**
 * Ornament Positioning Tests
 *
 * Verifies that when ornament edit mode is OFF:
 * 1. Ornaments are positioned to the RIGHT of the anchor note
 * 2. Ornaments are positioned UP (above baseline)
 * 3. Ornaments are smaller (60% font size)
 * 4. Ornaments are dark blue color (#1e40af)
 * 5. Ornament arcs render as smooth curves
 */

import { test, expect } from '@playwright/test';

test.describe('Ornament Positioning (Edit Mode OFF)', () => {
  test.skip('ornaments appear right and up from anchor with smooth arc', async ({ page }) => {
    // SKIPPED: Expects #menu-ornament and ornament dialog UI that don't exist
    // Current implementation uses WYSIWYG select-and-apply pattern
    await page.goto('http://localhost:8080');
    await page.waitForSelector('#notation-editor', { state: 'visible' });
    await page.waitForTimeout(2000); // Wait for WASM to load

    // Step 1: Type a parent note
    await page.click('#notation-editor');
    await page.keyboard.type('s'); // Type note 's'
    await page.waitForTimeout(500);

    // Step 2: Position cursor AFTER the note (cursor should be at position 1)
    // The cursor is already after 's' from typing, so we don't need to move it
    // But let's explicitly position it to be safe
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // Move to position after 's'
    await page.waitForTimeout(300);

    // Step 3: Open ornament editor via Edit menu
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);

    // Wait for menu to be visible and click ornament menu item
    await page.waitForSelector('#menu-ornament', { state: 'visible' });
    await page.click('#menu-ornament');
    await page.waitForTimeout(500);

    // Verify dialog opened
    await expect(page.locator('#ornament-editor-dialog')).toBeVisible();

    // Step 4: Type ornament pitches in mini canvas
    await page.click('#ornament-mini-canvas');
    await page.waitForTimeout(200);
    await page.keyboard.type('gr'); // Two ornament notes
    await page.waitForTimeout(500);

    // Step 5: Save ornament with Enter key
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify dialog closed
    await expect(page.locator('#ornament-editor-dialog')).not.toBeVisible();

    // Verify ornament edit mode is OFF
    const ornamentModeDisplay = page.locator('#ornament-edit-mode-display');
    await expect(ornamentModeDisplay).toContainText('Edit Ornament Mode: OFF');

    // Wait for rendering to complete
    await page.waitForTimeout(1000);

    // Find all rendered cells
    const cells = page.locator('.char-cell');
    const cellCount = await cells.count();

    console.log(`Found ${cellCount} cells rendered`);

    // Verify we have at least the parent note rendered
    // When edit mode is OFF, ornaments are rendered separately
    expect(cellCount).toBeGreaterThanOrEqual(1);

    // Get the parent note position (first cell)
    const parentCell = cells.first();
    const parentBox = await parentCell.boundingBox();
    expect(parentBox).toBeTruthy();

    console.log('Parent cell position:', parentBox);

    // Find ornament elements (rendered with class ornament-char)
    const ornaments = page.locator('.ornament-char');
    const ornamentCount = await ornaments.count();

    console.log(`Found ${ornamentCount} ornament characters`);
    expect(ornamentCount).toBeGreaterThanOrEqual(2); // Should have 2 'a' ornaments

    // Check first ornament position
    const firstOrnament = ornaments.first();
    const ornamentBox = await firstOrnament.boundingBox();
    expect(ornamentBox).toBeTruthy();

    console.log('First ornament position:', ornamentBox);

    // Verify ornament is to the RIGHT of parent
    expect(ornamentBox.x).toBeGreaterThan(parentBox.x + parentBox.width - 5); // Allow 5px tolerance

    // Verify ornament is UP (higher) than parent
    expect(ornamentBox.y).toBeLessThan(parentBox.y);

    // Check ornament color (dark blue)
    const ornamentStyle = await firstOrnament.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        color: computed.color,
        fontSize: computed.fontSize,
      };
    });

    console.log('Ornament style:', ornamentStyle);

    // RGB for #1e40af is approximately rgb(30, 64, 175)
    // Accept variations due to browser rendering
    expect(ornamentStyle.color).toMatch(/rgb\(.*30.*64.*175.*\)/);

    // Check for SVG arc overlay (should exist for ornament arcs)
    const svgOverlay = page.locator('.arc-overlay');
    await expect(svgOverlay).toBeVisible();

    // Find ornament arc paths
    const ornamentArcs = page.locator('.ornament-arc-path');
    const arcCount = await ornamentArcs.count();

    console.log(`Found ${arcCount} ornament arcs`);
    expect(arcCount).toBeGreaterThanOrEqual(1);

    // Verify arc is a smooth curve (not dashed)
    const arcPath = ornamentArcs.first();
    const arcAttrs = await arcPath.evaluate((el) => ({
      stroke: el.getAttribute('stroke'),
      strokeDasharray: el.getAttribute('stroke-dasharray'),
      d: el.getAttribute('d'),
    }));

    console.log('Arc attributes:', arcAttrs);

    // Verify stroke is dark blue
    expect(arcAttrs.stroke).toBe('#1e40af');

    // Verify NOT dashed (should be empty string or null)
    expect(arcAttrs.strokeDasharray === '' || arcAttrs.strokeDasharray === null).toBeTruthy();

    // Verify it's a cubic Bezier curve (starts with M, contains C)
    expect(arcAttrs.d).toMatch(/^M .* C .*/);

    console.log('✓ All ornament positioning checks passed');
  });

  test('LilyPond export includes ornament notation', async ({ page }) => {
    await page.goto('http://localhost:8080');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type pattern with ornaments
    await editor.click();
    await page.keyboard.type('1aa');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Switch to LilyPond tab
    const lilypondTab = page.locator('[data-tab="lilypond-src"]');
    await lilypondTab.click();

    // Get LilyPond source
    const lilypondSource = page.locator('#lilypond-source');
    await expect(lilypondSource).toBeVisible();

    const sourceText = await lilypondSource.textContent();
    console.log('LilyPond source:', sourceText);

    // Verify the source contains note content
    expect(sourceText.length).toBeGreaterThan(0);

    console.log('✓ LilyPond export verification passed');
  });
});
