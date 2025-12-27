// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Test combining marks rendering (fallback rendering without GSUB ligatures).
 *
 * When GSUB ligatures don't fire (e.g., combining mark without base character),
 * the raw combining marks should still render with the same width.
 *
 * This tests the reposition_combining_marks() function which sets both
 * U+0332 (combining underline) and U+0305 (combining overline) to half_width=300.
 */
test('combining marks alone have same width (fallback rendering)', async ({ page }) => {
  await page.goto('/');

  await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  // Create test elements with JUST combining marks (no base characters)
  // This simulates the fallback case where GSUB ligatures don't fire
  await page.evaluate(() => {
    const testDiv = document.createElement('div');
    testDiv.id = 'combining-test';
    testDiv.style.cssText = `
      position: fixed;
      top: 200px;
      left: 10px;
      background: white;
      padding: 20px;
      font-family: 'NotationFont', sans-serif;
      font-size: 48px;
      z-index: 10000;
    `;

    // Just combining underlines (U+0332) - 3 in a row
    const underlines = document.createElement('span');
    underlines.id = 'test-combining-underlines';
    underlines.style.cssText = 'display: inline-block; border: 1px solid red; background: #fee;';
    underlines.textContent = '\u0332\u0332\u0332'; // 3 combining underlines

    // Just combining overlines (U+0305) - 3 in a row
    const overlines = document.createElement('span');
    overlines.id = 'test-combining-overlines';
    overlines.style.cssText = 'display: inline-block; border: 1px solid blue; background: #eef; margin-left: 20px;';
    overlines.textContent = '\u0305\u0305\u0305'; // 3 combining overlines

    testDiv.appendChild(underlines);
    testDiv.appendChild(overlines);

    // Labels
    const labels = document.createElement('div');
    labels.style.fontSize = '14px';
    labels.style.marginTop = '10px';
    labels.innerHTML = '<span style="color:red">combining underlines (U+0332)</span> | <span style="color:blue">combining overlines (U+0305)</span>';
    testDiv.appendChild(labels);

    document.body.appendChild(testDiv);
  });

  await page.waitForTimeout(500);

  const combiningMeasurements = await page.evaluate(() => {
    const underlines = document.getElementById('test-combining-underlines');
    const overlines = document.getElementById('test-combining-overlines');

    if (!underlines || !overlines) {
      return { error: 'Combining mark test elements not found' };
    }

    const uRect = underlines.getBoundingClientRect();
    const oRect = overlines.getBoundingClientRect();

    return {
      underlineWidth: uRect.width,
      overlineWidth: oRect.width,
      underlineHeight: uRect.height,
      overlineHeight: oRect.height,
      widthDiff: Math.abs(uRect.width - oRect.width),
    };
  });

  console.log('Combining mark measurements:', combiningMeasurements);

  await page.screenshot({ path: 'test-results/combining-symmetry-visual.png', fullPage: false });

  // FAILING ASSERTION: If the combining marks have different widths, this test fails
  // The font's reposition_combining_marks() sets both to half_width=300, so they should be equal
  expect(combiningMeasurements.widthDiff,
    `Combining underline width (${combiningMeasurements.underlineWidth}px) should equal combining overline width (${combiningMeasurements.overlineWidth}px). ` +
    `Both should use half_width=300 from reposition_combining_marks().`
  ).toBeLessThanOrEqual(2);
});
