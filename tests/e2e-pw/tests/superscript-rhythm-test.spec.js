import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

/**
 * Bug: Superscripts in middle of beat incorrectly affect rhythm calculation
 *
 * Input: 1²³- (1 is regular pitch, 2 and 3 are superscripts, - is dash)
 *
 * Expected: 1²³- should be ONE beat with 2 timed elements (1 and -)
 *           Equivalent to "1-" = c4 (quarter note)
 *
 * Bug: Superscripts are breaking the beat or being counted as subdivisions
 *      Result is c2 (half note) instead of c4
 *
 * Per GRAMMAR.md: superscripts are rhythm-transparent, don't consume time,
 * don't define beat boundaries
 */

test('superscript pitches in middle of beat should not affect rhythm', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear editor
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "123-" (will make 23 into superscripts)
  await page.keyboard.type('123-');
  await page.waitForTimeout(100);

  // Select "23" (positions 1 and 2) and make them superscripts
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');  // Move past "1"
  await page.keyboard.press('Shift+ArrowRight');  // Select "2"
  await page.keyboard.press('Shift+ArrowRight');  // Select "23"
  await page.waitForTimeout(100);

  // Make selection into superscripts (grace notes)
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(300);

  // Check DocModel to see beat structure
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');
  console.log('=== DocModel for 1²³- ===');
  console.log(docmodel);

  // Check IR to see beat divisions
  await openTab(page, 'tab-ir');
  const ir = await readPaneText(page, 'pane-ir');
  console.log('=== IR for 1²³- ===');
  console.log(ir);

  // Check LilyPond output
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');
  console.log('=== LilyPond output for 1²³- ===');
  console.log(lilypond);

  // The main note should be c4 (quarter note), NOT c2 (half note)
  // 1²³- with superscripts = equivalent to 1- = 2 subdivisions = c4

  // Check that we have c4 (quarter note) not c2 (half note)
  const hasQuarterNote = lilypond.includes('c4') || lilypond.includes("c'4");
  const hasHalfNote = lilypond.includes('c2') || lilypond.includes("c'2");

  console.log('Has quarter note (c4):', hasQuarterNote);
  console.log('Has half note (c2):', hasHalfNote);

  // FAILING TEST: Currently produces c2 instead of c4
  expect(hasHalfNote).toBe(false);  // Should NOT have half note
  expect(hasQuarterNote).toBe(true); // Should have quarter note
});

test('baseline: 1- without superscripts should be c4', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear editor
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "1-" (baseline case - no superscripts)
  await page.keyboard.type('1-');
  await page.waitForTimeout(100);

  // Check LilyPond output
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');
  console.log('=== LilyPond output for 1- (baseline) ===');
  console.log(lilypond);

  // 1- = 2 subdivisions = c4 (quarter note)
  const hasQuarterNote = lilypond.includes('c4') || lilypond.includes("c'4");
  console.log('Has quarter note (c4):', hasQuarterNote);

  expect(hasQuarterNote).toBe(true);
});
