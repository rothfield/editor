/**
 * Diagnostic Test: Mouse Drag Selection Issues
 *
 * This test helps diagnose mouse drag selection problems by:
 * 1. Checking if mouse events are firing
 * 2. Verifying data-cell-index attributes exist
 * 3. Testing calculateCellPosition returns valid numbers
 * 4. Checking WASM mouseDown/mouseMove/mouseUp functions
 */

import { test, expect } from '@playwright/test';

test.describe('Mouse Drag Selection Diagnostics', () => {
  test('verify data-cell-index attributes are present on cells', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type some content
    await page.keyboard.type('123 456');
    await page.waitForTimeout(500);

    // Check if cells have data-cell-index attributes
    const diagnostics = await page.evaluate(() => {
      const cells = document.querySelectorAll('.char-cell');
      const results = {
        totalCells: cells.length,
        cellsWithIndex: 0,
        cellsWithoutIndex: 0,
        sampleIndices: [],
        cellInfo: []
      };

      cells.forEach((cell, i) => {
        const index = cell.getAttribute('data-cell-index');
        const cellData = {
          domIndex: i,
          dataIndex: index,
          textContent: cell.textContent,
          classes: Array.from(cell.classList)
        };

        results.cellInfo.push(cellData);

        if (index !== null && index !== undefined && index !== '') {
          results.cellsWithIndex++;
          if (results.sampleIndices.length < 5) {
            results.sampleIndices.push(index);
          }
        } else {
          results.cellsWithoutIndex++;
        }
      });

      return results;
    });

    console.log('Cell index diagnostics:', JSON.stringify(diagnostics, null, 2));

    // Assertions
    expect(diagnostics.totalCells).toBeGreaterThan(0);
    console.log(`✅ Found ${diagnostics.totalCells} total cells`);

    if (diagnostics.cellsWithoutIndex > 0) {
      console.warn(`⚠️ WARNING: ${diagnostics.cellsWithoutIndex} cells missing data-cell-index attribute!`);
      console.warn('Sample cells without index:',
        diagnostics.cellInfo.filter(c => !c.dataIndex).slice(0, 3)
      );
    } else {
      console.log('✅ All cells have data-cell-index attributes');
    }

    expect(diagnostics.cellsWithIndex).toBe(diagnostics.totalCells);
  });

  test('verify mouse position calculation returns valid numbers', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type content
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Simulate mouse position calculations
    const mouseCalcResults = await page.evaluate(() => {
      const editorEl = document.querySelector('#notation-editor');
      const rect = editorEl.getBoundingClientRect();

      // Test clicking in the middle of the editor
      const testX = rect.width / 2;
      const testY = rect.height / 2;

      // Try to call the MouseHandler's calculateCellPosition
      // (we can't directly access it, but we can check the DOM state)
      const cells = editorEl.querySelectorAll('.char-cell');
      const firstCell = cells[0];

      if (!firstCell) {
        return { error: 'No cells found' };
      }

      const firstCellIndex = firstCell.getAttribute('data-cell-index');
      const firstCellParsed = parseInt(firstCellIndex, 10);

      return {
        editorRect: {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top
        },
        testPosition: { x: testX, y: testY },
        cellCount: cells.length,
        firstCellIndex: firstCellIndex,
        firstCellParsed: firstCellParsed,
        isNaN: isNaN(firstCellParsed),
        cellSample: Array.from(cells).slice(0, 5).map(c => ({
          index: c.getAttribute('data-cell-index'),
          text: c.textContent,
          isNaN: isNaN(parseInt(c.getAttribute('data-cell-index'), 10))
        }))
      };
    });

    console.log('Mouse calculation diagnostics:', JSON.stringify(mouseCalcResults, null, 2));

    expect(mouseCalcResults.cellCount).toBeGreaterThan(0);
    expect(mouseCalcResults.isNaN).toBe(false);

    const hasNaN = mouseCalcResults.cellSample.some(c => c.isNaN);
    if (hasNaN) {
      console.error('❌ FOUND NaN in cell indices!');
      console.error('Cells with NaN:', mouseCalcResults.cellSample.filter(c => c.isNaN));
    } else {
      console.log('✅ No NaN values in cell indices');
    }

    expect(hasNaN).toBe(false);
  });

  test('capture mouse event errors in console', async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];

    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().toLowerCase().includes('error')) {
        consoleErrors.push(msg.text());
      }
      if (msg.text().includes('[MouseHandler]')) {
        console.log(msg.text());
      }
    });

    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type content
    await page.keyboard.type('123 456');
    await page.waitForTimeout(500);

    // Try to perform a mouse drag
    const box = await editor.boundingBox();

    // Click and drag from left to right
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(box.x + 150, box.y + box.height / 2);
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Check for errors
    console.log('\n=== CONSOLE ERRORS ===');
    consoleErrors.forEach(err => console.log(err));

    console.log('\n=== PAGE ERRORS ===');
    pageErrors.forEach(err => console.log(err));

    const mouseErrors = consoleErrors.filter(e =>
      e.includes('Mouse') || e.includes('NaN') || e.includes('mouseDown') || e.includes('mouseMove')
    );

    if (mouseErrors.length > 0) {
      console.error('❌ Found mouse-related errors:');
      mouseErrors.forEach(e => console.error(e));
    } else {
      console.log('✅ No mouse event errors detected');
    }

    // Don't fail the test, just report
    console.log(`Total console errors: ${consoleErrors.length}`);
    console.log(`Total page errors: ${pageErrors.length}`);
  });

  test('verify WASM mouse functions are callable', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.keyboard.type('123');
    await page.waitForTimeout(500);

    const wasmCheck = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const editor = app?.editor;
      const wasm = editor?.wasmModule;

      return {
        hasApp: !!app,
        hasEditor: !!editor,
        hasWASM: !!wasm,
        hasMouseDown: typeof wasm?.mouseDown === 'function',
        hasMouseMove: typeof wasm?.mouseMove === 'function',
        hasMouseUp: typeof wasm?.mouseUp === 'function',
        wasmFunctions: wasm ? Object.keys(wasm).filter(k => k.startsWith('mouse')) : []
      };
    });

    console.log('WASM function check:', JSON.stringify(wasmCheck, null, 2));

    expect(wasmCheck.hasWASM).toBe(true);
    expect(wasmCheck.hasMouseDown).toBe(true);
    expect(wasmCheck.hasMouseMove).toBe(true);
    expect(wasmCheck.hasMouseUp).toBe(true);

    console.log('✅ All WASM mouse functions are available');
  });
});
