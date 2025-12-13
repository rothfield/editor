/**
 * E2E tests for single-cell architecture (no continuation cells)
 *
 * Tests the behavior where multi-character glyphs like "1#", "||", "|:"
 * are stored as single cells with smart insert and two-stage backspace.
 *
 * NOTE: Smart insert/mutation features are pending re-implementation for textarea mode.
 * Tests marked .skip() require smart insert to work (1 + # → 1# single cell).
 * Currently textarea mode creates separate cells for each character.
 */

import { test, expect } from '@playwright/test';

test.describe('Single-Cell Architecture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // In textarea mode, we need to click on the textarea to focus it
    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.click();
  });

  // SKIP: Smart insert not yet implemented for textarea mode
  test.skip('Smart insert: typing 1# creates single cell with sharp', async ({ page }) => {
    // Type "1"
    await page.keyboard.type('1');

    // Type "#" - should modify previous cell instead of creating new cell
    await page.keyboard.type('#');

    // Check document model via inspector
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    const modelText = await docModel.innerText();

    // Should have ONE cell with char="1#" (YAML format)
    expect(modelText).toContain('char: "1#"');

    // Verify sharp pitch_code (encoded as N1s for Number system Do-sharp)
    expect(modelText).toContain('pitch_code: "N1s"');
  });

  // SKIP: Depends on smart insert (1# single cell)
  test.skip('Two-stage backspace: 1# -> 1 -> deleted', async ({ page }) => {
    // Type "1#"
    await page.keyboard.type('1#');

    // First backspace: should remove "#" but keep "1"
    await page.keyboard.press('Backspace');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    let modelText = await docModel.innerText();

    // Should still have ONE cell, but char="1" now (YAML format)
    expect(modelText).toContain('char: "1"');
    expect(modelText).not.toContain('char: "1#"');

    // Should have natural pitch_code (N1 for Number system Do-natural)
    expect(modelText).toContain('pitch_code: "N1"');

    // Second backspace: should delete the cell entirely
    await page.keyboard.press('Backspace');

    // Refresh inspector
    await page.getByTestId('tab-docmodel').click();
    modelText = await docModel.innerText();

    // Should have no cells now (empty line in YAML format)
    expect(modelText).toContain('cells: []');
  });

  // SKIP: Smart insert not yet implemented for textarea mode
  test.skip('Smart insert for barlines: | + | -> ||', async ({ page }) => {
    // Type "|"
    await page.keyboard.type('|');

    // Type another "|" - should modify to double barline
    await page.keyboard.type('|');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    const modelText = await docModel.innerText();

    // Should have ONE cell with DoubleBarline kind (char is now Unicode U+1D101)
    expect(modelText).toContain('name: "double_barline"');
    // Note: char is now the Unicode double barline 𝄁 (U+1D101), not ASCII "||"
  });

  // SKIP: Smart insert not yet implemented for textarea mode
  test.skip('Smart insert for repeat left barline: | + : -> |:', async ({ page }) => {
    // Type "|"
    await page.keyboard.type('|');

    // Type ":" - should modify to repeat left barline
    await page.keyboard.type(':');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    const modelText = await docModel.innerText();

    // Should have ONE cell with RepeatLeftBarline kind (char is now Unicode U+1D106)
    expect(modelText).toContain('name: "repeat_left_barline"');
    // Note: char is now the Unicode repeat left barline 𝄆 (U+1D106), not ASCII "|:"
  });

  // SKIP: Smart insert not yet implemented for textarea mode
  test.skip('Smart insert for repeat right barline: : + | -> :|', async ({ page }) => {
    // Type ":"
    await page.keyboard.type(':');

    // Type "|" - should modify to repeat right barline
    await page.keyboard.type('|');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    const modelText = await docModel.innerText();

    // Should have ONE cell with RepeatRightBarline kind (char is now Unicode U+1D107)
    expect(modelText).toContain('name: "repeat_right_barline"');
    // Note: char is now the Unicode repeat right barline 𝄇 (U+1D107), not ASCII ":|"
  });

  // SKIP: Depends on smart insert (|| single cell)
  test.skip('Two-stage backspace for barlines: || -> | -> deleted', async ({ page }) => {
    // Type "||"
    await page.keyboard.type('||');

    // First backspace: should remove one "|" leaving single "|"
    await page.keyboard.press('Backspace');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    let modelText = await docModel.innerText();

    // Should have ONE cell with kind="SingleBarline" (char is now Unicode U+1D100)
    expect(modelText).toContain('name: "single_barline"');
    // Note: char is now the Unicode barline character 𝄀 (U+1D100), not ASCII "|"

    // Second backspace: should delete the cell
    await page.keyboard.press('Backspace');

    // Refresh inspector
    await page.getByTestId('tab-docmodel').click();
    modelText = await docModel.innerText();

    // Should have no cells
    expect(modelText).toContain('cells: []');
  });

  // SKIP: Smart insert not yet implemented for textarea mode
  test.skip('Double sharp accidental: 1## creates single cell', async ({ page }) => {
    // Type "1##"
    await page.keyboard.type('1##');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    const modelText = await docModel.innerText();

    // Should have ONE cell with char="1##"
    expect(modelText).toContain('char: "1##"');

    // Should have DoubleSharp pitch_code (N1ss for Number system Do-double-sharp)
    expect(modelText).toContain('pitch_code: "N1ss"');
  });

  // SKIP: Depends on smart insert behavior
  test.skip('Accidental limit: cannot add more than 2 accidentals', async ({ page }) => {
    // Type "1##"
    await page.keyboard.type('1##');

    // Try to type another "#" - should NOT modify cell (limit reached)
    await page.keyboard.type('#');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docModel = page.getByTestId('pane-docmodel');
    await expect(docModel).toBeVisible();

    const modelText = await docModel.innerText();

    // Should have TWO cells now:
    // 1. "1##" (DoubleSharp)
    // 2. "#" (Symbol - couldn't be added to previous cell)
    const cellMatches = modelText.match(/char: "/g);
    expect(cellMatches?.length).toBeGreaterThanOrEqual(2);

    expect(modelText).toContain('char: "1##"');
    expect(modelText).toContain('char: "#"');
  });

  // SKIP: Depends on smart insert (1# single cell with pitch_code N1s)
  test.skip('LilyPond export reflects single-cell architecture', async ({ page }) => {
    // Type "1#"
    await page.keyboard.type('1#');

    // Check LilyPond output
    await page.getByTestId('tab-lilypond').click();
    const lilypondPane = page.getByTestId('pane-lilypond');
    await expect(lilypondPane).toBeVisible();

    // Wait for LilyPond output to populate
    await expect.poll(async () => (await lilypondPane.innerText()).trim()).not.toEqual('');

    const lilypondText = (await lilypondPane.innerText())
      .replace(/\r\n/g, '\n')
      .trim();

    // Should contain sharp note (cs' is C-sharp in LilyPond english notation)
    expect(lilypondText).toMatch(/\bcs'|cis'|c-sharp|c\s*sharp/i);
  });

  // SKIP: Depends on smart insert (1# single cell with pitch_code N1s)
  test.skip('MusicXML export reflects single-cell architecture', async ({ page }) => {
    // Type "1#"
    await page.keyboard.type('1#');

    // Check MusicXML output
    await page.getByTestId('tab-musicxml').click();
    const musicxmlPane = page.getByTestId('pane-musicxml');
    await expect(musicxmlPane).toBeVisible();

    // Wait for MusicXML output to populate
    await expect.poll(async () => (await musicxmlPane.innerText()).trim()).not.toEqual('');

    const musicxmlText = (await musicxmlPane.innerText())
      .replace(/\r\n/g, '\n')
      .trim();

    // Should contain step C and alter +1 (sharp)
    expect(musicxmlText).toContain('<step>C</step>');
    expect(musicxmlText).toContain('<alter>1</alter>');
  });
});
