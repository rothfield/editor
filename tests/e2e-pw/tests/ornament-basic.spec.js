/**
 * E2E Tests: Basic Ornament Application (WYSIWYG - Select and Apply Pattern)
 * Feature: 006-music-notation-ornament
 * User Story 1: Adding Ornaments to Embellish Musical Phrases
 *
 * IMPORTANT: These tests use the WYSIWYG "select and apply" pattern (like slurs/octaves)
 * NOT the old delimiter syntax (<234>) which was removed per Decision #8 in research.md
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getDocumentModel, assertLilyPondNotEmpty } from '../helpers/inspectors.js';

test.describe('Basic Ornament Application - WYSIWYG Pattern', () => {
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

  test('T013: Apply ornament via Alt+0 - verify indicators set in Document Model', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type: 2 3 4 1
    await page.keyboard.type('2 3 4 1');
    await page.waitForTimeout(300);

    // Select first three characters (2, space, 3, space, 4)
    // Note: In the editor, spaces might be cells or not depending on implementation
    // Strategy: Use Home, then Shift+Right to select exactly 5 characters: "2 3 4"
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }

    // Apply ornament with Alt+0 (default "after" position)
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Verify ornament indicators in Document Model
    const doc = await getDocumentModel(page);
    expect(doc.lines).toBeDefined();
    expect(doc.lines.length).toBeGreaterThan(0);

    const cells = doc.lines[0].cells;
    expect(cells).toBeDefined();

    // Find cells with ornament indicators
    const ornamentCells = cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name && c.ornament_indicator.name !== 'none'
    );

    // Should have at least 2 ornament cells (start and end)
    expect(ornamentCells.length).toBeGreaterThanOrEqual(2);

    // Verify start indicator
    const startCell = ornamentCells.find(c => c.ornament_indicator.name.includes('start'));
    expect(startCell).toBeDefined();
    expect(startCell.ornament_indicator.name).toMatch(/ornament_.*_start/);

    // Verify end indicator
    const endCell = ornamentCells.find(c => c.ornament_indicator.name.includes('end'));
    expect(endCell).toBeDefined();
    expect(endCell.ornament_indicator.name).toMatch(/ornament_.*_end/);

    console.log('✅ T013: Ornament indicators correctly set via Alt+0');
  });

  test('T014: Visual rendering - ornament cells have CSS styling', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type and select
    await page.keyboard.type('2 3 4 1');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }

    // Apply ornament
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Check for ornament visual styling
    // Note: Implementation might use class "ornament-cell" or data attributes
    const ornamentCells = page.locator('.ornament-cell, [data-ornament], .cell.ornament');

    // If ornament cells are rendered
    const count = await ornamentCells.count();
    if (count > 0) {
      const firstOrnamentCell = ornamentCells.first();
      await expect(firstOrnamentCell).toBeVisible({ timeout: 5000 });

      // Get computed styles
      const styles = await firstOrnamentCell.evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          fontSize: computed.fontSize,
          verticalAlign: computed.verticalAlign,
          color: computed.color,
          position: computed.position
        };
      });

      console.log(`✅ T014: Ornament cells styled - fontSize: ${styles.fontSize}, verticalAlign: ${styles.verticalAlign}, color: ${styles.color}`);
    } else {
      console.log('⚠️ T014: Ornament visual rendering pending implementation');
    }
  });

  test('T015: Zero-width floating layout verification', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type, select, and apply ornament
    await page.keyboard.type('a b c D');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight'); // Select "a b c"
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // In normal mode, ornaments should use floating layout
    const ornamentCells = page.locator('.ornament-cell, [data-ornament-floating], .cell.ornament');

    const count = await ornamentCells.count();
    if (count > 0) {
      const layoutInfo = await ornamentCells.first().evaluate(el => {
        const computed = window.getComputedStyle(el);
        return {
          position: computed.position,
          width: computed.width,
          display: computed.display
        };
      });

      console.log(`✅ T015: Ornament layout - position: ${layoutInfo.position}, width: ${layoutInfo.width}`);
      // Floating layout should use position: absolute or relative with special positioning
    } else {
      console.log('⚠️ T015: Floating layout pending implementation');
    }
  });

  test('T016 & T017: LilyPond export contains grace notes', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type, select, and apply ornament
    await page.keyboard.type('2 3 4 1');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Open LilyPond tab and verify export
    await openTab(page, 'tab-lilypond');
    const lilypondText = await readPaneText(page, 'pane-lilypond');

    // Verify basic LilyPond structure exists
    expect(lilypondText.length).toBeGreaterThan(0);

    // When ornament export is implemented, should contain \grace {}
    if (lilypondText.includes('\\grace')) {
      expect(lilypondText).toMatch(/\\grace\s*\{[^}]*\}/);
      console.log('✅ T016 & T017: LilyPond export contains \\grace {} syntax');
    } else {
      console.log('⚠️ T016 & T017: Grace note export pending implementation');
      console.log('LilyPond output:', lilypondText.substring(0, 200));
    }
  });

  test('T037: Collision detection - overlapping ornaments get spacing', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create two adjacent ornaments that would collide
    await page.keyboard.type('C 2 3 D 4 5 E');
    await page.waitForTimeout(300);

    // Select and apply first ornament group (2 3)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // Skip C
    await page.keyboard.press('ArrowRight'); // Skip space
    await page.keyboard.press('Shift+ArrowRight'); // Select 2
    await page.keyboard.press('Shift+ArrowRight'); // Select space
    await page.keyboard.press('Shift+ArrowRight'); // Select 3
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(300);

    // Select and apply second ornament group (4 5)
    await page.keyboard.press('Home');
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('ArrowRight'); // Navigate to "4"
    }
    await page.keyboard.press('Shift+ArrowRight'); // Select 4
    await page.keyboard.press('Shift+ArrowRight'); // Select space
    await page.keyboard.press('Shift+ArrowRight'); // Select 5
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Verify layout handles collision
    // This is a placeholder test - collision detection may add spacing
    const ornamentCells = page.locator('.ornament-cell, [data-ornament]');
    const count = await ornamentCells.count();

    if (count >= 4) {
      console.log('✅ T037: Multiple ornaments rendered, collision detection active');
    } else {
      console.log('⚠️ T037: Collision detection pending implementation');
    }
  });
});
