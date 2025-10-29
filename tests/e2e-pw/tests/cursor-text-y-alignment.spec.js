import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Cursor and Text Y-Position Alignment', () => {
  test('cursor should be vertically aligned with text (same Y position)', async ({ editorPage: page }) => {
    // Type some content to create text and cursor
    await typeInEditor(page, '1 2 3');

    // Wait for rendering to settle
    await page.waitForTimeout(100);

    // Get cursor and cell positions
    const alignment = await page.evaluate(() => {
      const cursor = document.querySelector('.cursor-indicator');
      const cell = document.querySelector('.char-cell');
      const cellContainer = cell?.closest('.cell-container');

      if (!cursor || !cellContainer) {
        return { error: 'Elements not found' };
      }

      const cursorRect = cursor.getBoundingClientRect();
      const cellRect = cellContainer.getBoundingClientRect();

      // Get the computed styles
      const cursorTop = parseFloat(cursor.style.top);
      const cellTop = parseFloat(cellContainer.style.top);

      return {
        cursorStyleTop: cursorTop,
        cellStyleTop: cellTop,
        cursorScreenY: cursorRect.top,
        cellScreenY: cellRect.top,
        cursorHeight: cursorRect.height,
        cellHeight: cellRect.height,
        yDifference: Math.abs(cursorRect.top - cellRect.top),
        cellWidth: cellContainer.offsetWidth,
        cellHeight: cellContainer.offsetHeight
      };
    });

    if (alignment.error) {
      throw new Error(alignment.error);
    }

    console.log('Cursor/Cell Alignment:');
    console.log(`  Cursor style top: ${alignment.cursorStyleTop}px`);
    console.log(`  Cell style top: ${alignment.cellStyleTop}px`);
    console.log(`  Cursor screen Y: ${alignment.cursorScreenY}`);
    console.log(`  Cell screen Y: ${alignment.cellScreenY}`);
    console.log(`  Y difference: ${alignment.yDifference}px`);
    console.log(`  Cell dimensions: ${alignment.cellWidth}px × ${alignment.cellHeight}px`);

    // Cursor should be at the same Y position as the cell
    // Allow 2px tolerance for rounding errors
    expect(alignment.yDifference).toBeLessThan(2);

    // Cell should be positioned reasonably high in the line
    // After font doubling, cells should be at ~64px from top of line (not pushed down to 64px)
    expect(alignment.cellStyleTop).toBeLessThan(70);
  });

  test('cursor height should match cell height', async ({ editorPage: page }) => {
    await typeInEditor(page, 'A');
    await page.waitForTimeout(100);

    const dimensions = await page.evaluate(() => {
      const cursor = document.querySelector('.cursor-indicator');
      const cellContainer = document.querySelector('.cell-container');

      if (!cursor || !cellContainer) {
        return { error: 'Elements not found' };
      }

      return {
        cursorHeight: parseInt(cursor.style.height),
        cellHeight: parseInt(cellContainer.style.height)
      };
    });

    if (dimensions.error) {
      throw new Error(dimensions.error);
    }

    console.log(`Cursor height: ${dimensions.cursorHeight}px, Cell height: ${dimensions.cellHeight}px`);

    // Cursor height should match cell height (both should be 32px after font doubling)
    expect(dimensions.cursorHeight).toBe(dimensions.cellHeight);
  });

  test('text in cell and cursor should be at same vertical baseline', async ({ editorPage: page }) => {
    await typeInEditor(page, '567');
    await page.waitForTimeout(100);

    const positions = await page.evaluate(() => {
      const charCell = document.querySelector('.char-cell');
      const cellContainer = charCell?.closest('.cell-container');
      const cursor = document.querySelector('.cursor-indicator');

      if (!charCell || !cellContainer || !cursor) {
        return { error: 'Elements not found' };
      }

      const charRect = charCell.getBoundingClientRect();
      const cursorRect = cursor.getBoundingClientRect();
      const containerRect = cellContainer.getBoundingClientRect();

      return {
        // All positions relative to the line container (parent)
        cellContainerTop: parseFloat(cellContainer.style.top),
        cursorStyleTop: parseFloat(cursor.style.top),
        charCellTop: charRect.top - containerRect.top,
        // Check if elements are visually aligned
        cursorScreenY: cursorRect.top,
        charScreenY: charRect.top,
        verticalGap: Math.abs(cursorRect.top - charRect.top),
        lineHeight: containerRect.height
      };
    });

    if (positions.error) {
      throw new Error(positions.error);
    }

    console.log('Text and Cursor Alignment:');
    console.log(`  Cell container top: ${positions.cellContainerTop}px`);
    console.log(`  Cursor style top: ${positions.cursorStyleTop}px`);
    console.log(`  Vertical gap between cursor and text: ${positions.verticalGap}px`);
    console.log(`  Line height: ${positions.lineHeight}px`);

    // Cursor and text should be at the same screen Y position (within 2px)
    expect(positions.verticalGap).toBeLessThan(2);

    // Cell container should not be pushed down too far
    // With proper scaling, should be < 70px (accounting for some padding)
    expect(positions.cellContainerTop).toBeLessThan(70);
  });
});
