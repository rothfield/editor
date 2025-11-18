/**
 * Test that constraints dialog displays notes using NotationFont glyphs
 */

import { test, expect } from '@playwright/test';

test('Constraints dialog displays notes with NotationFont glyphs', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  // Wait for editor initialization
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.editor?.isInitialized && window.editor?.wasmModule !== null;
    });
  }, { timeout: 10000 }).toBeTruthy();

  // Open constraints dialog directly
  await page.evaluate(() => {
    window.editor.ui.setConstraints();
  });

  // Wait for dialog to open
  const dialog = page.locator('#constraints-modal');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Select Ionian mode (major scale) - use .first() since there are multiple (Western/All tabs)
  const ionianCard = page.locator('[data-constraint-id="ionian"]').first();
  await expect(ionianCard).toBeVisible();

  // Get the notes display
  const notesDisplay = ionianCard.locator('.constraints-card-notes');
  await expect(notesDisplay).toBeVisible();

  // Get the text content (should be PUA codepoints, not Unicode text)
  const notesText = await notesDisplay.textContent();

  console.log('Ionian mode notes (raw text):', notesText);
  console.log('Number of characters:', notesText.split(' ').length);

  // Get individual character codepoints
  const codepoints = await page.evaluate(() => {
    const notesEl = document.querySelector('[data-constraint-id="ionian"] .constraints-card-notes');
    const text = notesEl.textContent.trim();
    const chars = text.split(' ').filter(c => c.length > 0);
    return chars.map(char => ({
      char: char,
      codepoint: 'U+' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
      length: char.length
    }));
  });

  console.log('Ionian mode glyphs:');
  codepoints.forEach((info, idx) => {
    console.log(`  ${idx + 1}: "${info.char}" ${info.codepoint} (length: ${info.length})`);
  });

  // Verify we have 7 notes (Ionian has all 7 natural degrees)
  expect(codepoints.length).toBe(7);

  // Verify each is a single character (NotationFont glyph, not multi-char Unicode)
  codepoints.forEach((info, idx) => {
    expect(info.length).toBe(1);
  });

  // Verify codepoints are in PUA range (0xE000+)
  codepoints.forEach((info, idx) => {
    const code = info.char.charCodeAt(0);
    expect(code).toBeGreaterThanOrEqual(0xE000);
    expect(code).toBeLessThan(0xF900); // End of PUA
  });

  // Verify computed font is NotationFont
  const computedFont = await notesDisplay.evaluate(el => {
    return window.getComputedStyle(el).fontFamily;
  });

  console.log('Computed font-family:', computedFont);
  expect(computedFont).toContain('NotationFont');

  // Test pitch system switching
  const pitchSystemSelect = page.locator('#constraints-pitch-system-select');
  await expect(pitchSystemSelect).toBeVisible();

  // Switch to Western system
  await pitchSystemSelect.selectOption('Western');
  await page.waitForTimeout(300); // Wait for re-render

  // Get Western notes
  const westernCodepoints = await page.evaluate(() => {
    const notesEl = document.querySelector('[data-constraint-id="ionian"] .constraints-card-notes');
    const text = notesEl.textContent.trim();
    const chars = text.split(' ').filter(c => c.length > 0);
    return chars.map(char => ({
      char: char,
      codepoint: 'U+' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
    }));
  });

  console.log('Western system glyphs:');
  westernCodepoints.forEach((info, idx) => {
    console.log(`  ${idx + 1}: "${info.char}" ${info.codepoint}`);
  });

  // Verify Western system also has 7 notes with PUA codepoints
  expect(westernCodepoints.length).toBe(7);
  westernCodepoints.forEach(info => {
    const code = info.char.charCodeAt(0);
    expect(code).toBeGreaterThanOrEqual(0xE000);
  });

  // Take screenshot for visual verification
  await page.screenshot({
    path: 'artifacts/constraints-notationfont-display.png',
    fullPage: false
  });

  console.log('✅ Constraints dialog displays NotationFont glyphs correctly');
});

test('Constraints with accidentals use integrated glyphs', async ({ page }) => {
  await page.goto('/');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();

  // Wait for editor initialization
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return window.editor?.isInitialized && window.editor?.wasmModule !== null;
    });
  }, { timeout: 10000 }).toBeTruthy();

  // Open constraints dialog directly
  await page.evaluate(() => {
    window.editor.ui.setConstraints();
  });

  const dialog = page.locator('#constraints-modal');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Select Dorian mode (has b3, b7) - use .first() since there are multiple (Western/All tabs)
  const dorianCard = page.locator('[data-constraint-id="dorian"]').first();
  await expect(dorianCard).toBeVisible();

  // Get the notes with accidentals
  const codepoints = await page.evaluate(() => {
    const notesEl = document.querySelector('[data-constraint-id="dorian"] .constraints-card-notes');
    if (!notesEl) return [];
    const text = notesEl.textContent.trim();
    const chars = text.split(' ').filter(c => c.length > 0);
    return chars.map(char => ({
      char: char,
      codepoint: 'U+' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
      length: char.length
    }));
  });

  console.log('Dorian mode glyphs (with accidentals):');
  codepoints.forEach((info, idx) => {
    console.log(`  ${idx + 1}: "${info.char}" ${info.codepoint} (length: ${info.length})`);
  });

  // Verify all notes are single characters (sharp/flat integrated into glyph)
  codepoints.forEach(info => {
    expect(info.length).toBe(1);
  });

  // Verify PUA range
  codepoints.forEach(info => {
    const code = info.char.charCodeAt(0);
    expect(code).toBeGreaterThanOrEqual(0xE000);
  });

  // Take screenshot
  await page.screenshot({
    path: 'artifacts/constraints-dorian-accidentals.png',
    clip: { x: 0, y: 100, width: 400, height: 300 }
  });

  console.log('✅ Accidentals rendered as integrated NotationFont glyphs');
});
