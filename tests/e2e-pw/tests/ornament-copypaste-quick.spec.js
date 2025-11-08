/**
 * Quick smoke test for ornament copy/paste functions
 * Verifies that the new cells-array pattern functions exist
 */

import { test, expect } from '@playwright/test';

test.describe('Ornament Copy/Paste - Function Availability', () => {
  test('should have all four ornament copy/paste functions available', async ({ page }) => {
    // 1. Load the page
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // 2. Check that all ornament functions are available in WASM module
    const functionsAvailable = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const wasm = editor.wasmModule;

      return {
        copyOrnamentFromCell: typeof wasm.copyOrnamentFromCell === 'function',
        pasteOrnamentToCell: typeof wasm.pasteOrnamentToCell === 'function',
        clearOrnamentFromCell: typeof wasm.clearOrnamentFromCell === 'function',
        setOrnamentPlacementOnCell: typeof wasm.setOrnamentPlacementOnCell === 'function'
      };
    });

    console.log('WASM ornament functions availability:', functionsAvailable);

    expect(functionsAvailable.copyOrnamentFromCell).toBe(true);
    expect(functionsAvailable.pasteOrnamentToCell).toBe(true);
    expect(functionsAvailable.clearOrnamentFromCell).toBe(true);
    expect(functionsAvailable.setOrnamentPlacementOnCell).toBe(true);

    console.log('✅ All ornament copy/paste functions are available!');
  });

  test('cursor positioning logic - cell_index = cursor.col - 1', async ({ page }) => {
    // This test verifies the "effective selection" logic works correctly
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type "123"
    await page.keyboard.type('123');
    await page.waitForTimeout(500);

    // Verify cursor position and calculate target cell index
    const cursorInfo = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      return {
        cursorCol: cursor.col,
        cellsLength: line.cells.length,
        targetCellIndex: cursor.col - 1,
        targetCellChar: line.cells[cursor.col - 1]?.char
      };
    });

    console.log('Cursor info:', cursorInfo);

    // After typing "123", cursor should be at col 3
    expect(cursorInfo.cursorCol).toBe(3);

    // Target cell index should be cursor.col - 1 = 2
    expect(cursorInfo.targetCellIndex).toBe(2);

    // Target cell should be "3" (the last character we typed)
    expect(cursorInfo.targetCellChar).toBe('3');

    console.log('✅ Cursor positioning logic correct: cell_index = cursor.col - 1');
  });

  test('menu placement checkboxes reflect current ornament state', async ({ page }) => {
    // Verify that placement option checkmarks accurately reflect which placement is active
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type "123ABC" - create ornament on first cell, then apply on second
    await page.keyboard.type('1');
    await page.waitForTimeout(100);
    await page.keyboard.type('23');
    await page.waitForTimeout(100);

    // Open the Ornament menu on cell 1
    const ornamentMenuButton = page.locator('#ornament-menu-button');
    await ornamentMenuButton.click();
    await page.waitForTimeout(300);

    // Copy the ornament from current cell
    await page.locator('#menu-ornament-copy').click();
    await page.waitForTimeout(300);

    // Move to next cell (cell 2)
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Open menu and paste ornament at default "Before" position
    await ornamentMenuButton.click();
    await page.waitForTimeout(300);

    // Paste the ornament
    await page.locator('#menu-ornament-paste').click();
    await page.waitForTimeout(300);

    // Open menu again - should show "Before" checked (from paste)
    await ornamentMenuButton.click();
    await page.waitForTimeout(300);

    const beforePasteState = await page.evaluate(() => {
      const menu = document.getElementById('ornament-menu');
      const beforeCheckbox = menu.querySelector('#menu-ornament-before .menu-checkbox');
      const ontopCheckbox = menu.querySelector('#menu-ornament-ontop .menu-checkbox');
      const afterCheckbox = menu.querySelector('#menu-ornament-after .menu-checkbox');

      return {
        beforeChecked: beforeCheckbox.dataset.checked === 'true',
        ontopChecked: ontopCheckbox.dataset.checked === 'true',
        afterChecked: afterCheckbox.dataset.checked === 'true'
      };
    });

    console.log('After pasting ornament:', beforePasteState);
    expect(beforePasteState.beforeChecked).toBe(true);  // Pasted at Before
    expect(beforePasteState.ontopChecked).toBe(false);
    expect(beforePasteState.afterChecked).toBe(false);

    // Now change placement to "After"
    await page.locator('#menu-ornament-after').click();
    await page.waitForTimeout(300);

    // Open menu again and verify "After" is now checked
    await ornamentMenuButton.click();
    await page.waitForTimeout(300);

    const afterState = await page.evaluate(() => {
      const menu = document.getElementById('ornament-menu');
      const beforeCheckbox = menu.querySelector('#menu-ornament-before .menu-checkbox');
      const ontopCheckbox = menu.querySelector('#menu-ornament-ontop .menu-checkbox');
      const afterCheckbox = menu.querySelector('#menu-ornament-after .menu-checkbox');

      return {
        beforeChecked: beforeCheckbox.dataset.checked === 'true',
        ontopChecked: ontopCheckbox.dataset.checked === 'true',
        afterChecked: afterCheckbox.dataset.checked === 'true'
      };
    });

    console.log('After changing placement to "After":', afterState);
    expect(afterState.beforeChecked).toBe(false);
    expect(afterState.ontopChecked).toBe(false);
    expect(afterState.afterChecked).toBe(true);  // Now After should be checked

    console.log('✅ Menu placement checkboxes reflect current ornament state');
  });

  test('menu should close when clicking in editor', async ({ page }) => {
    // This test verifies that the Ornament menu closes when clicking in the editor
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type some notes so we have cells to work with
    await page.keyboard.type('123');
    await page.waitForTimeout(300);

    // Open the Ornament menu
    const ornamentMenuButton = page.locator('#ornament-menu-button');
    await ornamentMenuButton.click();
    await page.waitForTimeout(300);

    // Verify menu is open
    const ornamentMenu = page.locator('#ornament-menu');
    await expect(ornamentMenu).not.toHaveClass(/hidden/);
    console.log('✅ Ornament menu is open');

    // Click in the editor to trigger mousedown (which closes menus)
    console.log('Clicking in editor to trigger mousedown event...');
    await editor.click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(300);

    // Check menu state
    const menuState = await page.evaluate(() => {
      const menu = document.getElementById('ornament-menu');
      return {
        isHidden: menu.classList.contains('hidden'),
        classList: menu.className
      };
    });

    console.log('Menu state after clicking in editor:', menuState);

    // Menu should be closed now
    const isHidden = await ornamentMenu.evaluate(el =>
      el.classList.contains('hidden')
    );

    expect(isHidden).toBe(true);
    console.log('✅ Menu closed when clicking in editor');
  });

  test('editor should accept input immediately after menu closes', async ({ page }) => {
    // Verify that the editor can accept input immediately after menu is closed
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type initial notes
    await page.keyboard.type('123');
    await page.waitForTimeout(300);

    // Move cursor to known position (end of line)
    // After typing "123", cursor should be at col 3, let's move it right past any trailing characters
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Open the Ornament menu by clicking the button (not clicking in editor yet)
    const ornamentMenuButton = page.locator('#ornament-menu-button');
    await ornamentMenuButton.click();
    await page.waitForTimeout(300);

    // Verify menu is open
    const ornamentMenu = page.locator('#ornament-menu');
    await expect(ornamentMenu).not.toHaveClass(/hidden/);
    console.log('✅ Menu is open');

    // Press Escape to close menu instead of clicking (this keeps the cursor in place)
    console.log('Pressing Escape to close menu...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);  // Wait for event handlers to process

    // Verify menu is closed
    const isHidden = await ornamentMenu.evaluate(el =>
      el.classList.contains('hidden')
    );
    expect(isHidden).toBe(true);
    console.log('✅ Menu closed');

    // Verify cursor position and focus before typing
    const beforeState = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      return {
        line: cursor.line,
        col: cursor.col,
        hasFocus: document.activeElement === document.getElementById('notation-editor')
      };
    });
    console.log('State before typing:', beforeState);
    expect(beforeState.hasFocus).toBe(true);  // Editor should have focus now

    // Type immediately after menu closes (editor already has focus)
    console.log('Typing after menu closes...');
    await page.keyboard.type('4');
    await page.waitForTimeout(300);

    // Verify that the character was typed (should be at col 4)
    const cursorInfo = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const cursor = editor.theDocument.state.cursor;
      const line = editor.theDocument.lines[cursor.line];

      return {
        cursorCol: cursor.col,
        cellsLength: line.cells.length,
        lastChar: line.cells[line.cells.length - 1]?.char
      };
    });

    console.log('Cursor info after typing:', cursorInfo);
    expect(cursorInfo.cursorCol).toBe(4);  // Should have moved from col 3 to col 4
    expect(cursorInfo.lastChar).toBe('4');  // Last character should be "4"

    console.log('✅ Editor accepted input immediately after menu closed');
  });
});
