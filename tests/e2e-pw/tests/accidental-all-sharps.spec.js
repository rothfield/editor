import { test, expect } from '@playwright/test';

test.describe('Sharp Accidentals - All Pitch Systems', () => {
  test('All number pitch system sharps render as glyphs (1# through 7#)', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test all number pitches with sharps
    const testCases = [
      { pitch: '1#', expected_codepoint: 0xE1F0 }, // 1 is at index 0
      { pitch: '2#', expected_codepoint: 0xE1F1 }, // 2 is at index 1
      { pitch: '3#', expected_codepoint: 0xE1F2 }, // 3 is at index 2
      { pitch: '4#', expected_codepoint: 0xE1F3 }, // 4 is at index 3
      { pitch: '5#', expected_codepoint: 0xE1F4 }, // 5 is at index 4
      { pitch: '6#', expected_codepoint: 0xE1F5 }, // 6 is at index 5
      { pitch: '7#', expected_codepoint: 0xE1F6 }, // 7 is at index 6
    ];

    for (const testCase of testCases) {
      // Clear editor
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Type the pitch
      await page.keyboard.type(testCase.pitch);

      // Find the pitch cell
      const pitchCell = page.locator('.char-cell.kind-pitched').first();
      await expect(pitchCell).toBeVisible();

      // Get the rendered text content
      const textContent = await pitchCell.textContent();
      const codepoint = textContent.charCodeAt(0);

      console.log(`${testCase.pitch}: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (expected U+${testCase.expected_codepoint.toString(16).toUpperCase().padStart(4, '0')})`);

      // Verify it matches expected codepoint
      expect(codepoint).toBe(testCase.expected_codepoint);
    }
  });

  test('Western pitch system sharps render as glyphs', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Test Western note names with sharps
    // C=0, D=1, E=2, F=3, G=4, A=5, B=6
    const testCases = [
      { pitch: 'C#', expected_codepoint: 0xE1F0 }, // C is at index 0
      { pitch: 'D#', expected_codepoint: 0xE1F1 }, // D is at index 1
      { pitch: 'E#', expected_codepoint: 0xE1F2 }, // E is at index 2
      { pitch: 'F#', expected_codepoint: 0xE1F3 }, // F is at index 3
      { pitch: 'G#', expected_codepoint: 0xE1F4 }, // G is at index 4
      { pitch: 'A#', expected_codepoint: 0xE1F5 }, // A is at index 5
      { pitch: 'B#', expected_codepoint: 0xE1F6 }, // B is at index 6
    ];

    for (const testCase of testCases) {
      // Clear editor
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');

      // Type the pitch
      await page.keyboard.type(testCase.pitch);

      // Find the pitch cell
      const pitchCell = page.locator('.char-cell.kind-pitched').first();
      await expect(pitchCell).toBeVisible();

      // Get the rendered text content
      const textContent = await pitchCell.textContent();
      const codepoint = textContent.charCodeAt(0);

      console.log(`${testCase.pitch}: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')} (expected U+${testCase.expected_codepoint.toString(16).toUpperCase().padStart(4, '0')})`);

      // Verify it matches expected codepoint
      expect(codepoint).toBe(testCase.expected_codepoint);
    }
  });

  test('Sharp glyphs use NotationMono font', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type a sharp
    await page.keyboard.type('1#');

    // Find the pitch cell
    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    // Get the computed font-family
    const fontFamily = await pitchCell.evaluate(el =>
      window.getComputedStyle(el).fontFamily
    );

    console.log(`Font family: ${fontFamily}`);
    expect(fontFamily).toContain('NotationMono');
  });

  test('Mixed content: base pitches, dots, sharps', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type mixed notation: base, dotted, sharp
    await page.keyboard.type('1 2. 3#');

    // Get all pitch cells
    const pitchCells = page.locator('.char-cell.kind-pitched');
    const count = await pitchCells.count();

    console.log(`Found ${count} pitch cells`);

    // First cell: plain '1' (should be base character)
    const cell1 = pitchCells.nth(0);
    const content1 = await cell1.textContent();
    const cp1 = content1.charCodeAt(0);
    console.log(`Cell 1: U+${cp1.toString(16).toUpperCase().padStart(4, '0')}`);

    // Second cell: '2.' (dotted - should be in octave range U+E000-U+E0BB)
    const cell2 = pitchCells.nth(1);
    const content2 = await cell2.textContent();
    const cp2 = content2.charCodeAt(0);
    console.log(`Cell 2: U+${cp2.toString(16).toUpperCase().padStart(4, '0')}`);
    expect(cp2).toBeGreaterThanOrEqual(0xE000); // Octave variants start here

    // Third cell: '3#' (sharp - should be in accidental range U+E1F0-U+E21E)
    const cell3 = pitchCells.nth(2);
    const content3 = await cell3.textContent();
    const cp3 = content3.charCodeAt(0);
    console.log(`Cell 3: U+${cp3.toString(16).toUpperCase().padStart(4, '0')}`);
    expect(cp3).toBe(0xE1F2); // 3 sharp (index 2)
  });
});
