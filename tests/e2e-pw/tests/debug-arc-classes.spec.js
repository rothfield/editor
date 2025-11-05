import { test } from '@playwright/test';

test('Debug: Check what arc elements exist', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await editor.click();
  await page.keyboard.type('C-- D  E-- F');
  await page.waitForTimeout(1000);

  const arcInfo = await page.evaluate(() => {
    // Check for any arc-related SVG elements
    const allPaths = document.querySelectorAll('path');
    const arcOverlay = document.querySelector('.arc-overlay');

    console.log('=== ARC DEBUG INFO ===');
    console.log('Arc overlay exists?', !!arcOverlay);
    if (arcOverlay) {
      console.log('Arc overlay children:', arcOverlay.children.length);
      const classes = Array.from(arcOverlay.children).map(child => ({
        tag: child.tagName,
        class: child.getAttribute('class'),
        id: child.getAttribute('id')
      }));
      console.log('Arc children:', classes);
    }

    // Look for any element with 'arc' in class
    const arcElements = document.querySelectorAll('[class*="arc"]');
    console.log('Elements with "arc" in class:', arcElements.length);
    Array.from(arcElements).forEach((el, i) => {
      console.log(`  Arc ${i}: ${el.tagName}.${el.className}`);
    });

    // Look for beat-related elements
    const beatElements = document.querySelectorAll('[class*="beat"]');
    console.log('Elements with "beat" in class:', beatElements.length);

    // Check SVG structure
    const svgContainers = document.querySelectorAll('svg');
    console.log('Total SVG elements:', svgContainers.length);

    return {
      hasArcOverlay: !!arcOverlay,
      arcChildCount: arcOverlay?.children.length || 0,
      pathsTotal: allPaths.length,
      arcClassElements: arcElements.length,
      beatClassElements: beatElements.length
    };
  });

  console.log('Arc info:', arcInfo);
});
