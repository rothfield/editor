// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Test that overline/underline lines match character bbox width.
 *
 * Issue: For narrow characters like "1", the overline extends past
 * the visible character ink when using advance width instead of bbox.
 *
 * The overline LINE should only be as wide as the character's visible extent,
 * not the full advance width (cell width).
 */
test('overline line should not extend past character ink', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  // Create a visual test element
  await page.evaluate(() => {
    const testDiv = document.createElement('div');
    testDiv.id = 'overline-test';
    testDiv.style.cssText = `
      position: fixed;
      top: 50px;
      left: 50px;
      font-family: NotationFont, sans-serif;
      font-size: 150px;
      background: white;
      padding: 20px;
      border: 1px solid black;
    `;
    // Overlined "2" using combining mark
    testDiv.textContent = '2\u0305';
    document.body.appendChild(testDiv);
  });

  await page.waitForTimeout(500);

  // Take a screenshot for visual inspection
  const testElement = page.locator('#overline-test');
  await testElement.screenshot({ path: 'test-results/overline-visual-test.png' });

  // The actual visual test: compare ink bounds
  // We can't easily measure the actual rendered pixels, but we can check
  // if the overline extends past where the character ends visually

  // For "2": bbox is 48-520 out of advance 572
  // If overline uses advance width, it extends 52 units (572-520) past the "2"
  // That's about 9% extra width visually

  // Check font glyph data directly
  const glyphInfo = await page.evaluate(() => {
    // The overlined "2" glyph is at: 0xEC00 + ('2'.charCodeAt(0) - 0x20) = 0xEC12
    // Check if we can detect the overline extent

    // Create canvas to render and measure
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    ctx.font = '100px NotationFont';
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'top';

    // Render plain "2" and find its ink bounds
    ctx.clearRect(0, 0, 200, 200);
    ctx.fillText('2', 10, 50);
    const plainData = ctx.getImageData(0, 0, 200, 200).data;

    let plainMinX = 200, plainMaxX = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const alpha = plainData[(y * 200 + x) * 4 + 3];
        if (alpha > 10) { // Some ink
          if (x < plainMinX) plainMinX = x;
          if (x > plainMaxX) plainMaxX = x;
        }
      }
    }

    // Render overlined "2" and find its ink bounds
    ctx.clearRect(0, 0, 200, 200);
    ctx.fillText('2\u0305', 10, 50);
    const overData = ctx.getImageData(0, 0, 200, 200).data;

    let overMinX = 200, overMaxX = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const alpha = overData[(y * 200 + x) * 4 + 3];
        if (alpha > 10) {
          if (x < overMinX) overMinX = x;
          if (x > overMaxX) overMaxX = x;
        }
      }
    }

    return {
      plainInkWidth: plainMaxX - plainMinX,
      plainMinX,
      plainMaxX,
      overlinedInkWidth: overMaxX - overMinX,
      overMinX,
      overMaxX,
      overlineExtendsPastRight: overMaxX > plainMaxX + 2, // 2px tolerance
      overlineExtendsPastLeft: overMinX < plainMinX - 2,
      rightExtension: overMaxX - plainMaxX,
      leftExtension: plainMinX - overMinX,
    };
  });

  console.log('Glyph ink measurements:', JSON.stringify(glyphInfo, null, 2));

  // The overline should not extend significantly past the character's ink
  expect(glyphInfo.overlineExtendsPastRight,
    `Overline extends ${glyphInfo.rightExtension}px past character's right edge`
  ).toBe(false);

  // Clean up
  await page.evaluate(() => {
    document.getElementById('overline-test')?.remove();
  });
});

test('underline line should not extend past character ink', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  const glyphInfo = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    ctx.font = '100px NotationFont';
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'top';

    // Render plain "2"
    ctx.clearRect(0, 0, 200, 200);
    ctx.fillText('2', 10, 50);
    const plainData = ctx.getImageData(0, 0, 200, 200).data;

    let plainMinX = 200, plainMaxX = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const alpha = plainData[(y * 200 + x) * 4 + 3];
        if (alpha > 10) {
          if (x < plainMinX) plainMinX = x;
          if (x > plainMaxX) plainMaxX = x;
        }
      }
    }

    // Render underlined "2"
    ctx.clearRect(0, 0, 200, 200);
    ctx.fillText('2\u0332', 10, 50);
    const underData = ctx.getImageData(0, 0, 200, 200).data;

    let underMinX = 200, underMaxX = 0;
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const alpha = underData[(y * 200 + x) * 4 + 3];
        if (alpha > 10) {
          if (x < underMinX) underMinX = x;
          if (x > underMaxX) underMaxX = x;
        }
      }
    }

    return {
      plainInkWidth: plainMaxX - plainMinX,
      underlinedInkWidth: underMaxX - underMinX,
      underlineExtendsPastRight: underMaxX > plainMaxX + 2,
      rightExtension: underMaxX - plainMaxX,
    };
  });

  console.log('Underline ink measurements:', JSON.stringify(glyphInfo, null, 2));

  expect(glyphInfo.underlineExtendsPastRight,
    `Underline extends ${glyphInfo.rightExtension}px past character's right edge`
  ).toBe(false);
});
