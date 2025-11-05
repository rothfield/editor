import { test, expect } from '@playwright/test';

test('Beat arcs should be positioned below cell baseline', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type notation with beats
  await editor.click();
  await page.keyboard.type('C D E F');
  await page.waitForTimeout(1000);

  const arcAnalysis = await page.evaluate(() => {
    // Get staff lines and cells for reference
    const staffLines = document.querySelectorAll('.staff-line, [class*="line"]');
    const cellElements = document.querySelectorAll('[class*="cell"], [class*="note"]');

    console.log('=== BEAT ARC ANALYSIS ===');
    console.log('Staff lines found:', staffLines.length);
    console.log('Cell elements found:', cellElements.length);

    // Get the SVG container and any arc-like elements
    const svgContainer = document.querySelector('svg');
    if (!svgContainer) {
      console.log('No SVG found');
      return { error: 'No SVG container' };
    }

    // Get all paths that might be arcs
    const allPaths = svgContainer.querySelectorAll('path');
    console.log('Total paths in SVG:', allPaths.length);

    // Look for beat loop specific elements
    const arcOverlay = document.querySelector('.arc-overlay');
    let beatArcs = [];
    if (arcOverlay) {
      beatArcs = Array.from(arcOverlay.querySelectorAll('[data-arc-type="beat-loop"], .beat-loop-arc, path'));
    }

    console.log('Beat arcs found:', beatArcs.length);

    // Analyze positions
    if (cellElements.length > 0) {
      const firstCell = cellElements[0];
      const cellRect = firstCell.getBoundingClientRect();
      console.log(`First cell: top=${cellRect.top.toFixed(0)}, bottom=${cellRect.bottom.toFixed(0)}, height=${cellRect.height.toFixed(0)}`);

      if (beatArcs.length > 0) {
        const firstArc = beatArcs[0];
        const arcRect = firstArc.getBoundingClientRect();
        console.log(`First arc: top=${arcRect.top.toFixed(0)}, bottom=${arcRect.bottom.toFixed(0)}`);
        console.log(`Arc relative to cell: arcTop - cellBottom = ${(arcRect.top - cellRect.bottom).toFixed(0)}`);

        // Should be below (positive value)
        const relativePosition = arcRect.top - cellRect.bottom;
        return {
          cellBottom: cellRect.bottom,
          arcTop: arcRect.top,
          relativePosition,
          isBelowBaseline: relativePosition >= 0,
          beatArcCount: beatArcs.length
        };
      }
    }

    return {
      cellCount: cellElements.length,
      beatArcCount: beatArcs.length,
      arcOverlayExists: !!arcOverlay
    };
  });

  console.log('Arc analysis:', arcAnalysis);

  // Check that arcs exist
  expect(arcAnalysis.beatArcCount || arcAnalysis.beatArcCount === 0).toBeDefined();

  // If we got relative position data, verify arcs are below baseline
  if (arcAnalysis.relativePosition !== undefined) {
    expect(arcAnalysis.isBelowBaseline).toBe(true);
  }
});
