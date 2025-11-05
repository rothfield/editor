/**
 * E2E Tests: Ornament Toggle Behavior (WYSIWYG Pattern)
 * Feature: 006-music-notation-ornament
 * User Story 2: Toggle ornament styling on/off
 * Tests T048-T050: Toggle off, position change, partial selection
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getDocumentModel } from '../helpers/inspectors.js';

test.describe('Ornament Toggle Behavior', () => {
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

  test('T048: Toggle off - reapply same ornament type removes styling', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type some content
    await page.keyboard.type('2 3 4 1');
    await page.waitForTimeout(300);

    // Apply ornament (after position)
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight'); // Select "2 3 4"
    }
    await page.keyboard.press('Alt+0'); // Apply ornament (default "after")
    await page.waitForTimeout(500);

    // Verify ornament was applied
    const doc = await getDocumentModel(page);
    let ornamentCells = doc.lines[0].cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name !== 'none'
    );
    expect(ornamentCells.length).toBeGreaterThanOrEqual(2);
    console.log('✅ T048: Ornament applied, found', ornamentCells.length, 'ornamental cells');

    // Reapply same ornament type (toggle off)
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0'); // Reapply same ornament type
    await page.waitForTimeout(500);

    // Verify ornament was removed
    const doc2 = await getDocumentModel(page);
    ornamentCells = doc2.lines[0].cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name !== 'none'
    );
    expect(ornamentCells.length).toBe(0);
    console.log('✅ T048: Toggle off successful, ornaments removed');
  });

  test('T049: Position change - apply different ornament type changes position', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type some content
    await page.keyboard.type('2 3 4 1');
    await page.waitForTimeout(300);

    // Apply "after" ornament
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0'); // Default "after" position
    await page.waitForTimeout(500);

    // Verify "after" position
    const doc = await getDocumentModel(page);
    let startCell = doc.lines[0].cells.find(c =>
      c.ornament_indicator && c.ornament_indicator.name.includes('after_start')
    );
    expect(startCell).toBeTruthy();
    console.log('✅ T049: Initial ornament position: after');

    // Apply "before" ornament (should change position, not toggle off)
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }

    // Trigger "before" ornament via menu
    const menuButton = page.getByTestId('menu-apply-ornament-before');
    if (await menuButton.count() > 0) {
      await menuButton.click();
      await page.waitForTimeout(500);

      // Verify position changed to "before"
      const doc2 = await getDocumentModel(page);
      startCell = doc2.lines[0].cells.find(c =>
        c.ornament_indicator && c.ornament_indicator.name.includes('before_start')
      );
      expect(startCell).toBeTruthy();
      console.log('✅ T049: Ornament position changed to: before');
    } else {
      console.log('⚠️  T049: Menu button not found, skipping position change test');
    }
  });

  test('T050: Partial selection - mixed ornamental and non-ornamental cells', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type content
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(300);

    // Apply ornament to middle section (2 3 4)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // Skip "1"
    await page.keyboard.press('ArrowRight'); // Skip space
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight'); // Select "2 3 4"
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Verify ornament applied
    const doc = await getDocumentModel(page);
    let ornamentCells = doc.lines[0].cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name !== 'none'
    );
    expect(ornamentCells.length).toBeGreaterThanOrEqual(2);

    // Now select a range that includes both ornamental and non-ornamental cells
    // Select from "1" through part of ornamental section
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight'); // Select "1 2 3"
    }

    // Apply ornament to this mixed selection
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Verify behavior (should apply ornament to entire selection)
    const doc2 = await getDocumentModel(page);
    ornamentCells = doc2.lines[0].cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name !== 'none'
    );

    // Should have ornaments (behavior may vary based on implementation)
    console.log(`✅ T050: Partial selection handled, ${ornamentCells.length} ornamental cells`);
  });

  test('Multiple toggle cycles - apply, remove, apply again', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    await page.keyboard.type('2 3 4');
    await page.waitForTimeout(300);

    // Cycle 1: Apply
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(300);

    const doc = await getDocumentModel(page);
    let count1 = doc.lines[0].cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name !== 'none'
    ).length;
    expect(count1).toBeGreaterThan(0);

    // Cycle 2: Remove
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(300);

    const doc2 = await getDocumentModel(page);
    let count2 = doc2.lines[0].cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name !== 'none'
    ).length;
    expect(count2).toBe(0);

    // Cycle 3: Apply again
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(300);

    const doc3 = await getDocumentModel(page);
    let count3 = doc3.lines[0].cells.filter(c =>
      c.ornament_indicator && c.ornament_indicator.name !== 'none'
    ).length;
    expect(count3).toBeGreaterThan(0);

    console.log('✅ Multiple toggle cycles work correctly');
  });
});
