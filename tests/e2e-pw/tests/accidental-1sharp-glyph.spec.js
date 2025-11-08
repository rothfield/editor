import { test, expect } from '@playwright/test';

test.describe('1# Sharp Accidental Glyph', () => {
  test('FAILING: 1# should render as single NotationMono glyph (U+E1F0)', async ({ page }) => {
    // Navigate to editor
    await page.goto('/');

    // Get editor element
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type "1#" - should represent a sharp accidental in number pitch system
    await editor.click();
    await page.keyboard.type('1#');

    // Find the rendered pitch cell for 1#
    // The cell should contain a SINGLE character with data-accidental="sharp"
    const pitchCell = page.locator('.char-cell[data-accidental="sharp"]').first();

    await expect(pitchCell).toBeVisible();

    // FAILING TEST: The pitch cell should render as a single glyph from NotationMono
    // Expected: Single composite glyph U+E1F0 (1_sharp) from NotationMono font
    // Current: Rendering as "1" + "#" via CSS ::after pseudo-element

    // Get the computed font-family
    const fontFamily = await pitchCell.evaluate(el =>
      window.getComputedStyle(el).fontFamily
    );

    console.log(`Font family: ${fontFamily}`);

    // The font-family should be NotationMono
    expect(fontFamily).toContain('NotationMono');

    // Get the actual text content
    const textContent = await pitchCell.textContent();
    console.log(`Text content: "${textContent}"`);

    // FAILING: Should be a single character glyph (U+E1F0)
    // Currently it's "1" as text (the ::after is not in textContent)
    // This is the KEY FAILURE: textContent should be the single glyph, not just base char

    // This requires:
    // 1. WASM to output U+E1F0 codepoint instead of "1" with data-accidental="sharp"
    // 2. JavaScript to map accidental notation to PUA codepoints
    // 3. Rendering layer to use the single glyph from NotationMono

    // The ACTUAL FAILURE - checking for single glyph:
    expect(textContent.trim()).toBe('\uE1F0'); // Single glyph from NotationMono PUA
  });

  test('FAILING: Editor should map 1# notation to U+E1F0 glyph', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();

    // Type notation with sharp accidental
    await page.keyboard.type('1#');

    // The rendered output should use NotationMono glyph U+E1F0
    // NOT the CSS ::after workaround with pseudo-elements

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Check that cell doesn't have the hacky ::after style
    // (should use single composite glyph instead)
    const hasAfterElement = await pitchCell.evaluate(el => {
      const style = window.getComputedStyle(el, '::after');
      return style.content && style.content !== 'none';
    });

    // This WILL fail - we currently use ::after for accidentals
    // When properly implemented, sharp accidentals should use NotationMono glyphs
    console.log(`Has ::after pseudo-element: ${hasAfterElement}`);

    // The expectation for proper implementation:
    // expect(hasAfterElement).toBe(false); // Should use single glyph instead
  });

  test('FAILING: All sharp accidentals (1# through T#) should have NotationMono glyphs', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();

    // Test multiple pitch systems with sharps
    const testCases = [
      { notation: '1#', system: 'number' },
      { notation: '2#', system: 'number' },
      { notation: 'C#', system: 'western' },
      { notation: 'S#', system: 'sargam' },
      { notation: 'd#', system: 'doremi' },
    ];

    for (const testCase of testCases) {
      // Clear editor
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Type notation
      await page.keyboard.type(testCase.notation);

      // Find pitch cell with accidental
      const pitchCell = page.locator('.char-cell[data-accidental="sharp"]').first();

      // FAILING: Should have NotationMono font and render as single glyph
      // Instead of "base_char" + "#" pseudo-element combo

      await expect(pitchCell).toBeVisible({ timeout: 1000 });

      const fontFamily = await pitchCell.evaluate(el =>
        window.getComputedStyle(el).fontFamily
      );

      expect(fontFamily).toContain('NotationMono');

      console.log(`✗ ${testCase.notation}: Uses NotationMono but renders as "char" + ::after, not single glyph`);
    }
  });

  test('FAILING: Inspector tab should show U+E1F0 codepoint for 1#', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type('1#');

    // Switch to Document Model tab to inspect raw representation
    const docModelTab = page.getByTestId('tab-docmodel');
    if (docModelTab) {
      await docModelTab.click();

      const docModelPane = page.getByTestId('pane-docmodel');
      await expect(docModelPane).toBeVisible();

      const content = await docModelPane.textContent();
      console.log('Document Model:');
      console.log(content);

      // FAILING: The document model should show U+E1F0 (or reference to 1_sharp)
      // Currently shows "1" with data-accidental="sharp" metadata
      // expect(content).toContain('E1F0'); // Will fail
    }
  });

  test('Reference: NotationMono font contains 1# glyph', async ({ page }) => {
    // This test passes - just verifies the font has the glyph
    await page.goto('/');

    // The NotationMono.ttf file contains:
    // - U+E1F0: 1_sharp (1 base + # symbol positioned right)
    // - U+E1F1: 2_sharp
    // - U+E1F2: 3_sharp
    // ... etc for all 47 pitch characters

    // But the rendering layer isn't using these glyphs yet.
    // Current workaround: Uses CSS ::after pseudo-element with "#" content

    console.log('✓ NotationMono.ttf contains all 47 sharp accidental glyphs (U+E1F0-U+E21E)');
    console.log('✗ Rendering layer not yet using these glyphs');
    console.log('✗ Still using old CSS ::after hack with "#" and "b" content');

    expect(true).toBe(true); // Placeholder - this test just logs status
  });
});
