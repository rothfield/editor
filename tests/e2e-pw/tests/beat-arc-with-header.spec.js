import { test, expect } from '@playwright/test';

test('Beat arcs positioned correctly with document header (composer)', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Set composer to trigger header rendering
  await page.evaluate(() => {
    window.musicEditor.document.composer = 'Test Composer';
    window.musicEditor.render();
  });

  // Type notation with beats
  await editor.click();
  await page.keyboard.type('1-- 2- 3--');
  await page.waitForTimeout(500);

  const analysis = await page.evaluate(() => {
    // Get header (including margins, matching measureHeaderHeight logic)
    const header = document.querySelector('.document-header');
    let headerHeight = 0;
    if (header) {
      const computedStyle = window.getComputedStyle(header);
      const marginTop = parseFloat(computedStyle.marginTop);
      const marginBottom = parseFloat(computedStyle.marginBottom);
      headerHeight = header.offsetHeight + marginTop + marginBottom;
    }

    // Get cells
    const cells = Array.from(document.querySelectorAll('.char-cell'));
    const firstCell = cells[0];
    const cellContainer = firstCell?.closest('.cell-container');

    // Get beat arcs
    const arcs = Array.from(document.querySelectorAll('.beat-loop-path'));
    const firstArc = arcs[0];
    const arcPath = firstArc ? firstArc.getAttribute('d') : null;
    const match = arcPath?.match(/M\s+([\d.]+)\s+([\d.]+)/);
    const arcStartY = match ? parseFloat(match[2]) : null;

    // Get cell Y from bounding rect (absolute viewport coordinates)
    const cellRect = cellContainer?.getBoundingClientRect();
    const cellBottom = cellRect ? cellRect.bottom : 0;

    // Get arc Y (also in absolute viewport coordinates via SVG)
    const arcRect = firstArc?.getBoundingClientRect();
    const arcY = arcRect ? arcRect.top : 0;

    return {
      headerHeight,
      cellBottom,
      arcY,
      matches: Math.abs(cellBottom - arcY) < 2, // Allow 1-2px tolerance
      diff: arcY - cellBottom
    };
  });

  console.log('=== VIEWPORT POSITIONS ===');
  console.log('Header height (with margins):', analysis.headerHeight);
  console.log('Cell bottom (viewport):', analysis.cellBottom);
  console.log('Arc Y (viewport):', analysis.arcY);
  console.log('Difference:', analysis.diff);
  console.log('Match (within 2px):', analysis.matches);

  // Arc should be at cell bottom
  expect(analysis.matches).toBe(true);
});
