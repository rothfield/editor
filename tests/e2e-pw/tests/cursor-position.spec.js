import { test, expect } from '../fixtures/editor.fixture';
import {
  typeInEditor,
} from '../utils/editor.helpers';

test.describe('Cursor Position - Visual Rendering', () => {
  test('BUG: RED cursor (selecting) positioned at line start instead of after "1"', async ({ editorPage: page }) => {
    // Type to trigger cursor
    await typeInEditor(page, '1');

    // Check at multiple points to catch the red cursor bug
    let foundRedCursorBug = false;
    let bugDetails = '';

    for (let attempt = 0; attempt < 20; attempt++) {
      const cursorInfo = await page.evaluate(() => {
        const cursor = document.querySelector('.cursor-indicator');
        const cell = document.querySelector('.char-cell');
        const cellContainer = cell?.closest('.cell-container');

        if (!cursor || !cellContainer) return null;

        const cellStart = parseFloat(cellContainer.style.left);
        const cellWidth = cellContainer.offsetWidth;
        const cellEnd = cellStart + cellWidth;
        const cursorPos = parseFloat(cursor.style.left);
        const cursorDisplay = cursor.style.display;
        const cursorClasses = cursor.className;
        const isRed = cursorClasses.includes('selecting');
        const isBlue = cursorClasses.includes('focused');

        return {
          cursorPos,
          cellStart,
          cellEnd,
          cellWidth,
          cursorDisplay,
          cursorClasses,
          isRedCursor: isRed,
          isBlueCursor: isBlue,
          cursorAtCellStart: Math.abs(cursorPos - cellStart) < 2,
          cursorAtCellEnd: cursorPos >= cellEnd - 2
        };
      });

      if (!cursorInfo) {
        await page.waitForTimeout(50);
        continue;
      }

      // Found red cursor positioned at cell start = BUG!
      if (cursorInfo.isRedCursor && cursorInfo.cursorAtCellStart) {
        foundRedCursorBug = true;
        bugDetails = `RED cursor BUG: cursorPos=${cursorInfo.cursorPos}, cellStart=${cursorInfo.cellStart}, cellEnd=${cursorInfo.cellEnd}. Classes: ${cursorInfo.cursorClasses}`;
        console.log('🔴 RED CURSOR BUG FOUND:', JSON.stringify(cursorInfo, null, 2));
        break;
      }

      console.log(`Attempt ${attempt}:`, cursorInfo.cursorClasses, `pos=${cursorInfo.cursorPos}`);
      await page.waitForTimeout(50);
    }

    if (foundRedCursorBug) {
      throw new Error(bugDetails);
    }
  });


  test('cursor MUST be positioned at right edge of "1", not its center or left edge', async ({ editorPage: page }) => {
    await typeInEditor(page, '1');
    await page.waitForTimeout(500);

    const info = await page.evaluate(() => {
      const cursor = document.querySelector('.cursor-indicator');
      const cell = document.querySelector('.char-cell');
      const cellContainer = cell?.closest('.cell-container');

      if (!cursor || !cellContainer) return null;

      const cellStart = parseFloat(cellContainer.style.left);
      const cellWidth = cellContainer.offsetWidth;
      const cellEnd = cellStart + cellWidth;
      const cursorPos = parseFloat(cursor.style.left);

      return {
        cursorPos,
        cellStart,
        cellEnd,
        cellWidth,
        cursorIsAfterCell: cursorPos >= cellEnd - 2,
        cursorDisplay: cursor.style.display
      };
    });

    expect(info).toBeTruthy();
    expect(info.cursorDisplay).not.toBe('none');
    expect(info.cursorIsAfterCell).toBe(true);
  });

  test('cursor CSS left position should be at right edge of "1"', async ({ editorPage: page }) => {
    // Type a single note
    await typeInEditor(page, '1');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Get the actual computed styles and positions
    const info = await page.evaluate(() => {
      const cell = document.querySelector('.char-cell');
      const cursor = document.querySelector('.cursor-indicator');

      if (!cell || !cursor) return null;

      const cellContainer = cell.closest('.cell-container');
      const cellBox = cell.getBoundingClientRect();
      const cursorBox = cursor.getBoundingClientRect();

      // Get the actual CSS left values
      const cellContainerStyle = window.getComputedStyle(cellContainer);
      const cursorStyle = window.getComputedStyle(cursor);
      const cellContainerLeft = cellContainer.style.left || cellContainerStyle.left;
      const cursorLeft = cursor.style.left || cursorStyle.left;

      return {
        cellContainerLeft: cellContainerLeft,
        cellContainerWidth: cellContainer.offsetWidth,
        cellText: cell.textContent,
        cursorLeft: cursorLeft,
        cursorDisplay: cursor.style.display,
        cursorVisible: cursor.offsetHeight > 0 && cursor.offsetWidth > 0,
        cellX: cellBox.left,
        cellWidth: cellBox.width,
        cellRight: cellBox.left + cellBox.width,
        cursorX: cursorBox.left,
        cursorWidth: cursorBox.width
      };
    });

    console.log('Cell & Cursor Info:', JSON.stringify(info, null, 2));

    expect(info).toBeTruthy();
    expect(info.cellText).toBe('1');

    // ASSERTION 1: Cursor should NOT be hidden
    expect(info.cursorDisplay).not.toBe('none');

    // ASSERTION 2: Cursor's CSS left should position it at the RIGHT edge of the cell
    // cellContainerLeft is where the cell starts, cellContainerWidth is the cell width
    // So cursor should be at: cellContainerLeft + cellContainerWidth
    const expectedCursorLeft = parseFloat(info.cellContainerLeft) + info.cellContainerWidth;
    const actualCursorLeft = parseFloat(info.cursorLeft);

    console.log(`Expected cursor left: ${expectedCursorLeft}, Actual: ${actualCursorLeft}`);

    expect(actualCursorLeft).toBeCloseTo(expectedCursorLeft, 0);
  });

  test('cursor visual X position should be at the right edge of "1"', async ({ editorPage: page }) => {
    // Type a single note
    await typeInEditor(page, '1');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Get the bounding box positions
    const positions = await page.evaluate(() => {
      const cell = document.querySelector('.char-cell');
      const cursor = document.querySelector('.cursor-indicator');

      if (!cell || !cursor) return null;

      const cellBox = cell.getBoundingClientRect();
      const cursorBox = cursor.getBoundingClientRect();

      return {
        cellLeft: cellBox.left,
        cellRight: cellBox.left + cellBox.width,
        cellWidth: cellBox.width,
        cursorLeft: cursorBox.left,
        cursorRight: cursorBox.left + cursorBox.width,
        cursorWidth: cursorBox.width,
        cursorVisible: cursor.offsetHeight > 0 && cursor.offsetWidth > 0,
        cursorDisplay: cursor.style.display
      };
    });

    console.log('Visual Positions:', JSON.stringify(positions, null, 2));

    expect(positions).toBeTruthy();

    // ASSERTION 1: Cursor should be visible
    expect(positions.cursorDisplay).not.toBe('none');

    // ASSERTION 2: Cursor left edge should be AT OR AFTER the cell's right edge
    // This means: cursor.left >= cell.right
    expect(positions.cursorLeft).toBeGreaterThanOrEqual(positions.cellRight - 1);
  });

  test('CATCHING BUG: click on "1" cell should position cursor correctly (no off-by-one)', async ({ editorPage: page }) => {
    // Type a single note
    await typeInEditor(page, '1');
    await page.waitForTimeout(300);

    // Get the cell position
    const cellInfo = await page.evaluate(() => {
      const cell = document.querySelector('.char-cell');
      if (!cell) return null;
      const box = cell.getBoundingClientRect();
      return {
        left: box.left,
        right: box.left + box.width,
        top: box.top,
        bottom: box.top + box.height
      };
    });

    expect(cellInfo).toBeTruthy();

    // Click on the right half of the "1" cell (should position cursor AFTER it)
    const rightHalfX = cellInfo.right - 2; // 2px from right edge
    const centerY = (cellInfo.top + cellInfo.bottom) / 2;

    console.log(`Clicking at X=${rightHalfX}, cellInfo.right=${cellInfo.right}, cell center would be ~${(cellInfo.left + cellInfo.right) / 2}`);

    await page.mouse.click(rightHalfX, centerY);
    await page.waitForTimeout(500);

    // Get cursor position from API and check state
    const info = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        cursorPos: app?.editor?.getCursorPosition?.(),
        cursorColumn: app?.editor?.theDocument?.state?.cursor?.col,
        cellCount: app?.editor?.theDocument?.lines?.[0]?.cells?.length
      };
    });

    console.log(`After clicking right side of "1": cursor position = ${info.cursorPos}, column = ${info.cursorColumn}, cells = ${info.cellCount}`);

    // Cursor should be at position 1 (after the "1")
    // NOT at position 0 (before the "1") - that would be the off-by-one bug
    expect(info.cursorPos).toBe(1);
  });

  test('click before "1" should position cursor at start', async ({ editorPage: page }) => {
    // Type a single note
    await typeInEditor(page, '1');
    await page.waitForTimeout(300);

    // Get the cell position
    const cellInfo = await page.evaluate(() => {
      const cell = document.querySelector('.char-cell');
      if (!cell) return null;
      const box = cell.getBoundingClientRect();
      return {
        left: box.left,
        right: box.left + box.width,
        top: box.top,
        bottom: box.top + box.height
      };
    });

    expect(cellInfo).toBeTruthy();

    // Click on the left half of the "1" cell (should position cursor BEFORE it)
    const leftHalfX = cellInfo.left + 2; // 2px from left edge
    const centerY = (cellInfo.top + cellInfo.bottom) / 2;

    await page.mouse.click(leftHalfX, centerY);
    await page.waitForTimeout(300);

    // Get cursor position from API
    const cursorPos = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.getCursorPosition?.();
    });

    console.log(`After clicking left side of "1": cursor position = ${cursorPos}`);

    // Cursor should be at position 0 (before the "1")
    expect(cursorPos).toBe(0);
  });
});

test.describe('Selection - Click behavior', () => {
  test('click while selection active should clear selection and move cursor', async ({ editorPage: page }) => {
    // Type content: "1 2 3"
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(300);

    // Create a selection by shift+clicking or shift+arrow
    // First, move to position 0
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // Shift+End to select all
    await page.keyboard.press('Shift+End');
    await page.waitForTimeout(300);

    // Verify selection exists
    let selectionInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        hasSelection: app?.editor?.hasSelection?.(),
        selectionActive: app?.editor?.theDocument?.state?.selection?.active,
        cursorPos: app?.editor?.getCursorPosition?.()
      };
    });

    console.log(`Before click - hasSelection: ${selectionInfo.hasSelection}, active: ${selectionInfo.selectionActive}`);
    expect(selectionInfo.hasSelection).toBe(true);

    // Now click on the "2" character (cell[2])
    const cellInfo = await page.evaluate(() => {
      const cells = document.querySelectorAll('.char-cell');
      if (cells.length < 3) return null;
      const cell = cells[2]; // Get third cell (the "2")
      const box = cell.getBoundingClientRect();
      return {
        left: box.left,
        right: box.left + box.width,
        top: box.top,
        bottom: box.top + box.height
      };
    });

    if (cellInfo) {
      const clickX = cellInfo.right - 2; // Click near right edge to ensure right half
      const clickY = (cellInfo.top + cellInfo.bottom) / 2;
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(300);
    }

    // After click, selection should be cleared
    selectionInfo = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        hasSelection: app?.editor?.hasSelection?.(),
        selectionActive: app?.editor?.theDocument?.state?.selection?.active,
        cursorPos: app?.editor?.getCursorPosition?.()
      };
    });

    console.log(`After click - hasSelection: ${selectionInfo.hasSelection}, active: ${selectionInfo.selectionActive}, cursorPos: ${selectionInfo.cursorPos}`);

    // ASSERTIONS
    expect(selectionInfo.hasSelection).toBe(false, 'Selection should be cleared after click');
    // Note: when selection is null, selection.active will be undefined
    expect(!selectionInfo.selectionActive).toBe(true, 'Selection.active should be falsy');
    // Cursor should have moved to the click position
    // Clicking middle of cell[2] ("2") should place cursor at position 3 (after "2")
    expect(selectionInfo.cursorPos).toBe(3, `Cursor should be at position 3, but is at ${selectionInfo.cursorPos}`);
  });
});
