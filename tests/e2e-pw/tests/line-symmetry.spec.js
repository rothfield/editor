// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Test that underline and overline loops have symmetric visual extent.
 *
 * This test verifies that when rendering text with underlines (beat grouping)
 * and overlines (slurs), the horizontal extent of the lines matches exactly.
 *
 * Visual failure: Overline extending beyond underline width.
 */
test('underline and overline loops have same visual extent', async ({ page }) => {
  // Load the font test page or create test content
  await page.goto('/');

  // Wait for editor and WASM to initialize
  await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500); // Wait for WASM init

  // Create test content with both underline (multi-cell beat) and overline (slur)
  // Enter input that will produce both
  const editor = page.locator('[data-testid="editor-root"]');
  await editor.click();

  // Clear any existing content
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');

  // Enter a simple pattern: "12" as a two-note beat (underlined), "34" as a slur (overlined)
  // Format: 12 is one beat with 2 subdivisions, (34) is a slur
  await page.keyboard.type('12 (34)');

  // Switch to Text tab in inspector to see rendered output
  await page.click('[data-testid="tab-text"]');
  await page.waitForTimeout(200);

  // Get the rendered text from the text tab
  const textPane = page.locator('[data-testid="pane-text"]');
  await expect(textPane).toBeVisible();

  const textContent = await textPane.innerText();
  console.log('Text export content:', textContent);

  // The text should contain both underlined and overlined characters
  // Check for the presence of loop arc characters (PUA codepoints)
  // U+E704 = LOOP_BOTTOM_LEFT, U+E705 = LOOP_BOTTOM_RIGHT
  // U+E706 = LOOP_TOP_LEFT, U+E707 = LOOP_TOP_RIGHT

  // Create a visual test by rendering the text in a controlled element
  // and measuring the actual widths

  // Inject a test element with the font
  await page.evaluate(() => {
    const testDiv = document.createElement('div');
    testDiv.id = 'symmetry-test';
    testDiv.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: white;
      padding: 20px;
      font-family: 'NotationFont', sans-serif;
      font-size: 48px;
      z-index: 10000;
    `;

    // Create underlined text: 1̲2̲ (1 + combining underline, 2 + combining underline)
    const underlined = document.createElement('div');
    underlined.id = 'test-underlined';
    underlined.style.display = 'inline-block';
    underlined.style.border = '1px solid red';
    underlined.textContent = '\uE704' + '1\u0332' + '2\u0332' + '\uE705'; // arc + 1̲ + 2̲ + arc

    // Create overlined text: 1̅2̅ (1 + combining overline, 2 + combining overline)
    const overlined = document.createElement('div');
    overlined.id = 'test-overlined';
    overlined.style.display = 'inline-block';
    overlined.style.border = '1px solid blue';
    overlined.style.marginLeft = '20px';
    overlined.textContent = '\uE706' + '1\u0305' + '2\u0305' + '\uE707'; // arc + 1̅ + 2̅ + arc

    testDiv.appendChild(underlined);
    testDiv.appendChild(overlined);
    document.body.appendChild(testDiv);

    // Also add labels
    const labelDiv = document.createElement('div');
    labelDiv.style.fontSize = '14px';
    labelDiv.style.marginTop = '10px';
    labelDiv.innerHTML = '<span style="color:red">underlined</span> | <span style="color:blue">overlined</span>';
    testDiv.appendChild(labelDiv);
  });

  // Wait for font to render
  await page.waitForTimeout(500);

  // Measure the widths
  const measurements = await page.evaluate(() => {
    const underlined = document.getElementById('test-underlined');
    const overlined = document.getElementById('test-overlined');

    if (!underlined || !overlined) {
      return { error: 'Test elements not found' };
    }

    const uRect = underlined.getBoundingClientRect();
    const oRect = overlined.getBoundingClientRect();

    return {
      underlinedWidth: uRect.width,
      overlinedWidth: oRect.width,
      underlinedHeight: uRect.height,
      overlinedHeight: oRect.height,
      difference: Math.abs(uRect.width - oRect.width),
    };
  });

  console.log('Width measurements:', measurements);

  // Take a screenshot for visual verification
  await page.screenshot({ path: 'test-results/line-symmetry-visual.png', fullPage: false });

  // Assert widths are equal (within 1px tolerance for anti-aliasing)
  expect(measurements.difference,
    `Underlined width (${measurements.underlinedWidth}px) should equal overlined width (${measurements.overlinedWidth}px)`
  ).toBeLessThanOrEqual(1);
});

/**
 * Test combining marks alone (fallback rendering without GSUB ligatures).
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

/**
 * Test that the arc glyphs have matching bounding boxes.
 */
test('arc glyphs render with matching extents', async ({ page }) => {
  await page.goto('/');

  // Wait for editor to load
  await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  // Create test elements for just the arc glyphs
  await page.evaluate(() => {
    const testDiv = document.createElement('div');
    testDiv.id = 'arc-test';
    testDiv.style.cssText = `
      position: fixed;
      top: 100px;
      left: 10px;
      background: white;
      padding: 20px;
      font-family: 'NotationFont', sans-serif;
      font-size: 96px;
      z-index: 10000;
    `;

    // Bottom arcs (U+E704, U+E705)
    const bottomArcs = document.createElement('div');
    bottomArcs.id = 'test-bottom-arcs';
    bottomArcs.style.display = 'inline-block';
    bottomArcs.style.border = '1px solid red';
    bottomArcs.textContent = '\uE704\uE705'; // left + right bottom arcs

    // Top arcs (U+E706, U+E707)
    const topArcs = document.createElement('div');
    topArcs.id = 'test-top-arcs';
    topArcs.style.display = 'inline-block';
    topArcs.style.border = '1px solid blue';
    topArcs.style.marginLeft = '20px';
    topArcs.textContent = '\uE706\uE707'; // left + right top arcs

    testDiv.appendChild(bottomArcs);
    testDiv.appendChild(topArcs);
    document.body.appendChild(testDiv);
  });

  await page.waitForTimeout(500);

  const arcMeasurements = await page.evaluate(() => {
    const bottom = document.getElementById('test-bottom-arcs');
    const top = document.getElementById('test-top-arcs');

    if (!bottom || !top) {
      return { error: 'Arc test elements not found' };
    }

    const bRect = bottom.getBoundingClientRect();
    const tRect = top.getBoundingClientRect();

    return {
      bottomWidth: bRect.width,
      topWidth: tRect.width,
      bottomHeight: bRect.height,
      topHeight: tRect.height,
      widthDiff: Math.abs(bRect.width - tRect.width),
      heightDiff: Math.abs(bRect.height - tRect.height),
    };
  });

  console.log('Arc measurements:', arcMeasurements);

  await page.screenshot({ path: 'test-results/arc-symmetry-visual.png', fullPage: false });

  // Arcs should have same width (they're zero-width combining marks, so this might be 0)
  // But if they render with different widths, that's the bug
  expect(arcMeasurements.widthDiff,
    `Bottom arc width (${arcMeasurements.bottomWidth}px) should equal top arc width (${arcMeasurements.topWidth}px)`
  ).toBeLessThanOrEqual(2);
});
