/**
 * Test: Verify LilyPond tuplet syntax with slurs
 *
 * Tests the case where slurs interact with actual tuplets:
 * "123" (no spaces) = 3 notes in one beat = 3:2 tuplet
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Check LilyPond output for actual 3:2 tuplet with slur', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 123 (NO SPACES - this creates a tuplet!)
  await editor.click();
  await page.keyboard.type('123');
  await page.waitForTimeout(300);

  // Select all 3 notes
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }

  // Apply slur
  await page.keyboard.press('Alt+S');
  await page.waitForTimeout(500);

  // Check MusicXML first
  await openTab(page, 'tab-musicxml');
  const musicxmlText = await readPaneText(page, 'pane-musicxml');

  console.log('\n=== MusicXML FOR TUPLET WITH SLUR ===');
  const noteMatches = musicxmlText.match(/<note>[\s\S]*?<\/note>/g) || [];
  console.log(`Found ${noteMatches.length} notes`);

  noteMatches.forEach((note, idx) => {
    const hasTimeModification = note.includes('<time-modification>');
    const hasTuplet = note.includes('<tuplet');
    const hasSlur = note.includes('<slur');
    console.log(`Note ${idx + 1}: time-mod=${hasTimeModification} tuplet=${hasTuplet} slur=${hasSlur}`);
  });

  // Now check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');

  console.log('\n=== LILYPOND FOR TUPLET WITH SLUR ===');
  console.log(lilypondText);
  console.log('=== END ===\n');

  // Check for tuplet syntax
  const hasTupletSyntax = lilypondText.includes('\\tuplet') || lilypondText.includes('\\times');
  const hasSlurSyntax = lilypondText.includes('(') || lilypondText.includes(')');

  console.log(`LilyPond has tuplet syntax (\\tuplet or \\times): ${hasTupletSyntax}`);
  console.log(`LilyPond has slur syntax ( or ): ${hasSlurSyntax}`);

  if (hasTupletSyntax) {
    console.log('✓ Tuplet syntax found');
    // Extract and show the tuplet line
    const tupletMatch = lilypondText.match(/\\(?:tuplet|times)[^\n]*/);
    if (tupletMatch) {
      console.log(`  Example: ${tupletMatch[0]}`);
    }
  } else {
    console.log('✗ Tuplet syntax NOT found - checking if notes are in normal notation...');
    // Show the actual note content
    const noteSection = lilypondText.match(/c'[\s\S]*?g'[^\n]*/);
    if (noteSection) {
      console.log(`  Note section: ${noteSection[0]}`);
    }
  }

  // Both should be present
  expect(hasTupletSyntax).toBe(true);
  expect(hasSlurSyntax).toBe(true);
});

test('Check LilyPond for 5:4 tuplet (12345 - 5 notes) with slur', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 12345 (NO SPACES - creates 5:4 tuplet)
  await editor.click();
  await page.keyboard.type('12345');
  await page.waitForTimeout(300);

  // Select all 5 notes
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }

  // Apply slur
  await page.keyboard.press('Alt+S');
  await page.waitForTimeout(500);

  // Check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');

  console.log('\n=== LILYPOND FOR 5:4 TUPLET WITH SLUR ===');
  console.log(lilypondText);
  console.log('=== END ===\n');

  const hasTupletSyntax = lilypondText.includes('\\tuplet') || lilypondText.includes('\\times');
  const hasSlurSyntax = lilypondText.includes('(') || lilypondText.includes(')');

  console.log(`LilyPond has tuplet syntax: ${hasTupletSyntax}`);
  console.log(`LilyPond has slur syntax: ${hasSlurSyntax}`);

  expect(hasTupletSyntax).toBe(true);
  expect(hasSlurSyntax).toBe(true);
});
