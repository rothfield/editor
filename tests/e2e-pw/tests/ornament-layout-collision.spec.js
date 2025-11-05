import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Ornament Layout and Collision Avoidance', () => {
  test('single ornament attached to anchor cell with correct positioning', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type content: "Hello"
    await page.keyboard.type('Hello');

    // Select "ell" (indices 1-3) to apply ornament
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // After H
    await page.keyboard.press('Shift+ArrowRight'); // Select e
    await page.keyboard.press('Shift+ArrowRight'); // Select l
    await page.keyboard.press('Shift+ArrowRight'); // Select l

    // Apply ornament to selection (default is "after" position)
    await page.keyboard.press('Alt+o');

    // Wait for layout to update
    // Note: ornament edit mode defaults to OFF, so ornaments are already locked
    await page.waitForTimeout(300);

    // Open Display List tab to verify positioning
    await openTab(page, 'tab-displaylist');
    const wasmLayout = await readPaneText(page, 'pane-displaylist');

    console.log('WASM Layout:', wasmLayout);

    // Verify we have cells rendered
    expect(wasmLayout).toContain('Line 0');

    // Parse the layout to check ornament positioning
    // Ornaments should have w: 0 (zero width overlays)
    // Ornaments should be positioned relative to anchor
    const cellMatches = wasmLayout.matchAll(/Cell\s+(\d+).*?x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*w:\s*([\d.]+)/g);
    const cells = Array.from(cellMatches).map(m => ({
      index: parseInt(m[1]),
      x: parseFloat(m[2]),
      y: parseFloat(m[3]),
      w: parseFloat(m[4])
    }));

    console.log('Parsed cells:', cells);

    // Find ornament cells (should have zero width)
    const ornamentCells = cells.filter(c => c.w === 0);
    const mainCells = cells.filter(c => c.w > 0);

    console.log('Ornament cells:', ornamentCells);
    console.log('Main cells:', mainCells);

    // Verify we have ornaments
    expect(ornamentCells.length).toBeGreaterThan(0);

    // Verify ornaments are positioned (x > 0, y > 0)
    for (const ornament of ornamentCells) {
      expect(ornament.x).toBeGreaterThan(0);
      expect(ornament.y).toBeGreaterThan(0);
    }
  });

  test('multiple ornaments on same anchor stack vertically with -8px spacing', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type content: "Hab"
    await page.keyboard.type('Hab');

    // Apply first ornament to "a"
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // After H
    await page.keyboard.press('Shift+ArrowRight'); // Select a
    await page.keyboard.press('Alt+o'); // Apply ornament

    // Apply second ornament to "b"
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // After H
    await page.keyboard.press('ArrowRight'); // After a
    await page.keyboard.press('Shift+ArrowRight'); // Select b
    await page.keyboard.press('Alt+o'); // Apply ornament

    // Wait for layout (ornaments already locked - mode defaults to OFF)
    await page.waitForTimeout(300);

    // Check Display List layout
    await openTab(page, 'tab-displaylist');
    const wasmLayout = await readPaneText(page, 'pane-displaylist');

    console.log('WASM Layout (multiple ornaments):', wasmLayout);

    // Parse cells
    const cellMatches = wasmLayout.matchAll(/Cell\s+(\d+).*?x:\s*([\d.]+),\s*y:\s*([\d.]+),\s*w:\s*([\d.]+)/g);
    const cells = Array.from(cellMatches).map(m => ({
      index: parseInt(m[1]),
      x: parseFloat(m[2]),
      y: parseFloat(m[3]),
      w: parseFloat(m[4])
    }));

    // Find ornament cells
    const ornamentCells = cells.filter(c => c.w === 0).sort((a, b) => a.index - b.index);

    console.log('Ornament cells:', ornamentCells);

    // Should have at least 2 ornament cells (one for each ornament content)
    expect(ornamentCells.length).toBeGreaterThanOrEqual(2);

    // Find ornaments that likely belong to different spans on the same anchor
    // They should have similar X positions but different Y positions
    const groupedByX = {};
    for (const cell of ornamentCells) {
      const xKey = Math.round(cell.x / 10) * 10; // Group by ~10px buckets
      if (!groupedByX[xKey]) groupedByX[xKey] = [];
      groupedByX[xKey].push(cell);
    }

    console.log('Ornaments grouped by X position:', groupedByX);

    // Check for groups with multiple ornaments (collision scenario)
    for (const [xPos, group] of Object.entries(groupedByX)) {
      if (group.length >= 2) {
        // These ornaments are at similar X positions (same anchor)
        // Verify they have different Y positions (stacked)
        const yPositions = group.map(c => c.y);
        const uniqueYPositions = [...new Set(yPositions)];

        console.log(`Ornaments at x≈${xPos}: Y positions =`, yPositions);

        // Should have different Y positions for collision avoidance
        expect(uniqueYPositions.length).toBeGreaterThan(1);

        // Check the spacing between stacked ornaments
        if (group.length === 2) {
          const [first, second] = group.sort((a, b) => b.y - a.y); // Sort by Y descending
          const spacing = first.y - second.y;

          console.log(`Vertical spacing between ornaments: ${spacing}px`);

          // Should be around 8px apart (could be negative due to collision offset)
          // The collision_offset_y is -8px per ornament
          expect(Math.abs(spacing)).toBeGreaterThan(6); // At least 6px apart
          expect(Math.abs(spacing)).toBeLessThan(12); // At most 12px apart
        }
      }
    }
  });

  test('ornament layout changes between edit mode ON and OFF', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type content: "Hello"
    await page.keyboard.type('Hello');

    // Select and apply ornament to "ell"
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // After H
    await page.keyboard.press('Shift+ArrowRight'); // Select e
    await page.keyboard.press('Shift+ArrowRight'); // Select l
    await page.keyboard.press('Shift+ArrowRight'); // Select l
    await page.keyboard.press('Alt+o'); // Apply ornament

    // Capture layout in LOCKED mode (OFF - default)
    await page.waitForTimeout(300);
    await openTab(page, 'tab-displaylist');
    const layoutLockedMode = await readPaneText(page, 'pane-displaylist');

    console.log('Layout (Edit Mode OFF - locked):', layoutLockedMode);

    // Toggle to edit mode (ON)
    await page.keyboard.press('Alt+Shift+O'); // ON
    await page.waitForTimeout(300);

    // Capture layout in EDIT mode (ON)
    await openTab(page, 'tab-displaylist');
    const layoutEditMode = await readPaneText(page, 'pane-displaylist');

    console.log('Layout (Edit Mode ON - editable):', layoutEditMode);

    // Layouts should be different
    expect(layoutEditMode).not.toBe(layoutLockedMode);

    // In locked mode, should have zero-width ornament cells
    expect(layoutLockedMode).toMatch(/w:\s*0(?:\.0)?/);

    // In edit mode, all cells should have non-zero width
    const editModeCells = layoutEditMode.matchAll(/w:\s*([\d.]+)/g);
    const editModeWidths = Array.from(editModeCells).map(m => parseFloat(m[1]));

    console.log('Edit mode cell widths:', editModeWidths);

    // In edit mode, expect all cells to have width > 0
    const allNonZero = editModeWidths.every(w => w > 0);
    expect(allNonZero).toBe(true);
  });
});
