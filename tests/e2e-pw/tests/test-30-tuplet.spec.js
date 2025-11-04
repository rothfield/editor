/**
 * Test: Verify LilyPond handles 30-tuplet correctly
 *
 * Reproduces bug where 30 notes in one beat are incorrectly split into 2 15-tuplets
 * instead of being output as a single 30-tuplet.
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('30-tuplet should render as single tuplet, not 2 15-tuplets', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 30 1's (NO SPACES - creates a 30-note tuplet)
  await editor.click();
  const thirtyOnes = '1'.repeat(30);
  await page.keyboard.type(thirtyOnes);
  await page.waitForTimeout(500);

  // Check MusicXML first
  await openTab(page, 'tab-musicxml');
  const musicxmlText = await readPaneText(page, 'pane-musicxml');

  console.log('\n=== MusicXML FOR 30-TUPLET ===');
  const noteMatches = musicxmlText.match(/<note>[\s\S]*?<\/note>/g) || [];
  console.log(`Found ${noteMatches.length} notes`);

  // Count time-modification elements
  const timeModCount = (musicxmlText.match(/<time-modification>/g) || []).length;
  console.log(`Found ${timeModCount} time-modification elements`);

  // Check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');

  console.log('\n=== LILYPOND FOR 30-TUPLET ===');
  console.log(lilypondText);
  console.log('=== END ===\n');

  // Count tuplet occurrences
  const tupletMatches = lilypondText.match(/\\tuplet\s+\d+\/\d+/g) || [];
  console.log(`Found ${tupletMatches.length} \\tuplet command(s):`);
  tupletMatches.forEach((match, idx) => {
    console.log(`  ${idx + 1}. ${match}`);
  });

  // Extract tuplet ratios
  const tupletRatios = tupletMatches.map(match => {
    const ratioMatch = match.match(/\\tuplet\s+(\d+)\/(\d+)/);
    if (ratioMatch) {
      return `${ratioMatch[1]}/${ratioMatch[2]}`;
    }
    return null;
  }).filter(r => r);

  console.log(`Tuplet ratios: ${tupletRatios.join(', ')}`);

  // EXPECTED: Single \tuplet 30/16 { ... }
  // ACTUAL (BUG): Two \tuplet 15/8 { ... }

  // Check assertions
  expect(tupletMatches.length).toBe(1); // Should be exactly 1 tuplet
  expect(lilypondText).toContain('\\tuplet 30/16'); // Should be 30:16 ratio
  expect(lilypondText).not.toContain('\\tuplet 15/'); // Should NOT split into 15-tuplets
});

test('15-tuplet should render as single tuplet (control test)', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 15 1's (NO SPACES)
  await editor.click();
  const fifteenOnes = '1'.repeat(15);
  await page.keyboard.type(fifteenOnes);
  await page.waitForTimeout(500);

  // Check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');

  console.log('\n=== LILYPOND FOR 15-TUPLET ===');
  console.log(lilypondText);
  console.log('=== END ===\n');

  const tupletMatches = lilypondText.match(/\\tuplet\s+\d+\/\d+/g) || [];
  console.log(`Found ${tupletMatches.length} \\tuplet command(s)`);

  // Should be exactly 1 tuplet for 15 notes
  expect(tupletMatches.length).toBe(1);
  expect(lilypondText).toContain('\\tuplet 15/8');
});
