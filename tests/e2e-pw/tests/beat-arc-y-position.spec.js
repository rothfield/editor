import { test, expect } from '@playwright/test';

test('Beat arc y positions should be consistent', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type notation with clear beat structure
  await editor.click();
  await page.keyboard.type('C-- D  E-- F');
  await page.waitForTimeout(1000);

  // Get all beat arc elements from the SVG
  const arcData = await page.evaluate(() => {
    const svgArcs = document.querySelectorAll('.beat-loop-arc');
    if (svgArcs.length === 0) {
      console.log('No beat loop arcs found');
      return { count: 0, arcs: [] };
    }

    const arcs = Array.from(svgArcs).map((arc, idx) => {
      const pathD = arc.getAttribute('d');
      // Extract y coordinates from path: "M x1 y1 C ..."
      const match = pathD.match(/M\s+([\d.]+)\s+([\d.]+)/);
      const startY = match ? parseFloat(match[2]) : null;

      return {
        index: idx,
        startY,
        pathLength: pathD.length,
        classList: arc.getAttribute('class')
      };
    });

    console.log('Beat arcs found:', arcs.length);
    arcs.forEach((arc, i) => {
      console.log(`  Arc ${i}: startY=${arc.startY}`);
    });

    return { count: arcs.length, arcs };
  });

  console.log('Total beat arcs:', arcData.count);
  expect(arcData.count).toBeGreaterThan(0);

  // Check that all beat arcs have reasonable y positions
  // They should all be at approximately the same y position (beat loop area)
  if (arcData.arcs.length > 0) {
    const yPositions = arcData.arcs.map(arc => arc.startY).filter(y => y !== null);

    if (yPositions.length > 0) {
      const minY = Math.min(...yPositions);
      const maxY = Math.max(...yPositions);
      const yRange = maxY - minY;

      console.log(`Beat arc y range: ${minY} to ${maxY} (range: ${yRange})`);

      // All beat arcs should be within a reasonable range of each other
      // Allowing 20px tolerance for rendering differences
      expect(yRange).toBeLessThan(20);
    }
  }
});
