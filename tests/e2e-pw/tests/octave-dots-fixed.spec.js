import { test, expect } from '@playwright/test';

test.describe('Octave Dots - With Decomposed References', () => {
  test('Octave variants should render with dots (U+E000 range)', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type a base pitch
    await page.keyboard.type('1');

    // Find the pitch cell
    let pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    let textContent = await pitchCell.textContent();
    let codepoint = textContent.charCodeAt(0);

    console.log(`Base 1: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);
    expect(codepoint).toBe(0x31); // ASCII '1'

    // Now apply octave +1 via menu or keyboard
    // Using Alt+U for upper octave as per CLAUDE.md
    await page.keyboard.press('Alt+U');

    // Get the same cell again
    pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    textContent = await pitchCell.textContent();
    codepoint = textContent.charCodeAt(0);

    console.log(`After Alt+U: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);

    // Should now be the octave variant glyph (U+E000 for '1' with +1 octave)
    expect(codepoint).toBe(0xE000);

    // Verify the cell shows dots by checking if it rendered the octave glyph
    const fontFamily = await pitchCell.evaluate(el =>
      window.getComputedStyle(el).fontFamily
    );
    expect(fontFamily).toContain('NotationMono');
  });

  test('Clearing octave shifts should restore base character', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type base pitch
    await page.keyboard.type('2');

    // Apply octave shift
    await page.keyboard.press('Alt+U');

    let pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    let textContent = await pitchCell.textContent();
    let codepoint = textContent.charCodeAt(0);

    console.log(`After Alt+U: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);

    // '2' is at index 1 in ALL_CHARS
    // With +1 octave, should be: 0xE000 + (1*4) + 0 = 0xE004
    expect(codepoint).toBe(0xE004);

    // Clear octave with Alt+M (middle octave)
    await page.keyboard.press('Alt+M');

    pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    textContent = await pitchCell.textContent();
    codepoint = textContent.charCodeAt(0);

    console.log(`After Alt+M: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);

    // Should be back to base '2'
    expect(codepoint).toBe(0x32); // ASCII '2'
  });

  test('Lower octave shifts should work', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type base pitch
    await page.keyboard.type('3');

    // Apply lower octave (-1) via Alt+L
    await page.keyboard.press('Alt+L');

    const pitchCell = page.locator('.char-cell.kind-pitched').first();
    await expect(pitchCell).toBeVisible();

    const textContent = await pitchCell.textContent();
    const codepoint = textContent.charCodeAt(0);

    console.log(`After Alt+L: U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`);

    // '3' is at index 2 in ALL_CHARS
    // With -1 octave, should be: 0xE000 + (2*4) + 2 = 0xE00A
    expect(codepoint).toBe(0xE00A);
  });
});
