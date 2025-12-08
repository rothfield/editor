/**
 * E2E Test: Text Tab Combining Underline for Beat Subdivisions
 *
 * Tests that when two notes are in the same beat (e.g., "11"), the text export
 * uses combining underline characters (U+0332) to show beat grouping.
 */
import { test, expect } from '@playwright/test';

test.describe('Text Tab Combining Underline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#notation-editor');
    await page.click('#notation-editor');
  });

  test('should show combining underline for "11" (two notes in same beat)', async ({ page }) => {
    // Type "11" - two notes in the same beat (subdivisions)
    await page.keyboard.type('11');
    await page.waitForTimeout(500);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear - poll until we get content with "1" in it
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.includes('1');
    }, { timeout: 10000 }).toBeTruthy();

    const text = await textDisplay.inputValue();
    console.log('Text output for "11":', JSON.stringify(text));
    console.log('Text codepoints:', [...text].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' '));

    // Should contain combining low line (U+0332) for beat grouping
    // With GSUB ligature approach, EACH character in a beat gets U+0332
    // The font substitutes each (char + U+0332) pair with a pre-composed underlined glyph
    // Adjacent underlines connect seamlessly because each underline matches the character width
    const COMBINING_LOW_LINE = '\u0332';

    expect(text).toContain('1');
    expect(text).toContain(COMBINING_LOW_LINE,
      'Text export should include combining underline (U+0332) for beat subdivisions'
    );

    // Count underlines - should be 2 (one for each character in the beat)
    const underlineCount = [...text].filter(c => c === COMBINING_LOW_LINE).length;
    expect(underlineCount).toBe(2,
      `Expected 2 combining underlines (one per char), got ${underlineCount}. ` +
      'Codepoints: ' + [...text].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ')
    );
  });

  test('should show continuous underline for "123" (three notes in same beat)', async ({ page }) => {
    // Type "123" - three notes in the same beat
    await page.keyboard.type('123');
    await page.waitForTimeout(200);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.trim().length;
    }, { timeout: 5000 }).toBeGreaterThan(0);

    const text = await textDisplay.inputValue();
    console.log('Text output for "123":', JSON.stringify(text));

    const COMBINING_LOW_LINE = '\u0332';

    // Should have underlines on each note in the beat group
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text).toContain(COMBINING_LOW_LINE,
      'Text export should include combining underline for beat subdivisions'
    );
  });

  test('should NOT show underline for "1 2" (separate beats)', async ({ page }) => {
    // Type "1 2" - two notes in separate beats (space = beat boundary)
    await page.keyboard.type('1 2');
    await page.waitForTimeout(200);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.trim().length;
    }, { timeout: 5000 }).toBeGreaterThan(0);

    const text = await textDisplay.inputValue();
    console.log('Text output for "1 2":', JSON.stringify(text));

    const COMBINING_LOW_LINE = '\u0332';

    // Should NOT have underlines since notes are in separate beats
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).not.toContain(COMBINING_LOW_LINE,
      'Text export should NOT include combining underline for notes in separate beats'
    );
  });

  test('should show space between beat groups for "12 34"', async ({ page }) => {
    // Type "12 34" - two beat groups with a space between
    await page.keyboard.type('12 34');
    await page.waitForTimeout(200);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.includes('1') && text.includes('3');
    }, { timeout: 5000 }).toBeTruthy();

    const text = await textDisplay.inputValue();
    console.log('Text output for "12 34":', JSON.stringify(text));
    console.log('Codepoints:', [...text].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' '));

    const COMBINING_LOW_LINE = '\u0332';

    // Should have underlines on each note within each beat group
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text).toContain('4');
    expect(text).toContain(COMBINING_LOW_LINE,
      'Text export should include combining underline for beat subdivisions'
    );

    // Count underlines - should be 4 (one for each character)
    const underlineCount = [...text].filter(c => c === COMBINING_LOW_LINE).length;
    expect(underlineCount).toBe(4,
      `Expected 4 combining underlines (one per char), got ${underlineCount}`
    );

    // Check for loop arc characters (new feature)
    const LOOP_BOTTOM_LEFT = '\uE704';
    const LOOP_BOTTOM_RIGHT = '\uE705';

    // Should have 2 left arcs (start of each beat group) and 2 right arcs (end of each)
    const leftArcCount = [...text].filter(c => c === LOOP_BOTTOM_LEFT).length;
    const rightArcCount = [...text].filter(c => c === LOOP_BOTTOM_RIGHT).length;
    expect(leftArcCount).toBe(2, `Expected 2 left loop arcs (one per beat group), got ${leftArcCount}`);
    expect(rightArcCount).toBe(2, `Expected 2 right loop arcs (one per beat group), got ${rightArcCount}`);

    // CRITICAL: There must be a space between the two beat groups
    // The output should be: "1̲2̲ 3̲4̲" (with space between "2̲" and "3̲")
    // Strip underlines and check for space
    const withoutUnderlines = text.replace(/\u0332/g, '');
    console.log('Without underlines:', JSON.stringify(withoutUnderlines));
    expect(withoutUnderlines).toContain(' ',
      'There should be a space between beat groups'
    );

    // The pattern should be: [BL_ARC] 1 U+0332 2 U+0332 [BR_ARC] SPACE [BL_ARC] 3 U+0332 4 U+0332 [BR_ARC]
    // This means when we look at the text, after removing underlines AND loop arcs, we get "12 34"
    // Note: The output may include an ABC-style header (e.g., "P: Number\n\n")
    // We just need to check that the note line contains "12 34"
    // Also strip loop arc characters (U+E704-E707)
    const withoutArcs = withoutUnderlines.replace(/[\uE704-\uE707]/g, '');
    expect(withoutArcs.trim()).toContain('12 34',
      'Text without underlines and arcs should contain "12 34"'
    );
  });

  test('should NOT show underline for single-item beat "1" (no subdivisions)', async ({ page }) => {
    // Type "1" - single note in a beat (no subdivisions, should NOT be underlined)
    await page.keyboard.type('1');
    await page.waitForTimeout(200);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.includes('1');
    }, { timeout: 5000 }).toBeTruthy();

    const text = await textDisplay.inputValue();
    console.log('Text output for "1":', JSON.stringify(text));
    console.log('Codepoints:', [...text].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' '));

    const COMBINING_LOW_LINE = '\u0332';

    // Should have the note "1" but NO underline (single item in beat = no subdivision)
    expect(text).toContain('1');
    expect(text).not.toContain(COMBINING_LOW_LINE,
      'Single-item beat should NOT have combining underline - underlines indicate beat subdivisions'
    );
  });

  test('should NOT show underline for single-item beats in "1 2 3" (each beat has one note)', async ({ page }) => {
    // Type "1 2 3" - three separate beats, each with one note
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(200);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.includes('1') && text.includes('2') && text.includes('3');
    }, { timeout: 5000 }).toBeTruthy();

    const text = await textDisplay.inputValue();
    console.log('Text output for "1 2 3":', JSON.stringify(text));
    console.log('Codepoints:', [...text].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' '));

    const COMBINING_LOW_LINE = '\u0332';

    // Should have the notes but NO underlines (each beat has only one item)
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text).not.toContain(COMBINING_LOW_LINE,
      'Single-item beats should NOT have combining underline - underlines indicate beat subdivisions'
    );
  });

  test('should only underline multi-item beats in "1 23 4" (middle beat has subdivisions)', async ({ page }) => {
    // Type "1 23 4" - middle beat has 2 notes (should be underlined), others have 1 (no underline)
    await page.keyboard.type('1 23 4');
    await page.waitForTimeout(200);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.includes('1') && text.includes('2') && text.includes('4');
    }, { timeout: 5000 }).toBeTruthy();

    const text = await textDisplay.inputValue();
    console.log('Text output for "1 23 4":', JSON.stringify(text));
    console.log('Codepoints:', [...text].map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' '));

    const COMBINING_LOW_LINE = '\u0332';

    // Should have all notes
    expect(text).toContain('1');
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text).toContain('4');

    // Should have exactly 2 underlines (only for "2" and "3" in the middle beat)
    const underlineCount = [...text].filter(c => c === COMBINING_LOW_LINE).length;
    expect(underlineCount).toBe(2,
      `Expected 2 combining underlines (only for middle beat "23"), got ${underlineCount}. ` +
      'Single-item beats "1" and "4" should NOT be underlined.'
    );
  });
});
