/**
 * Test: Verify LilyPond slur output for the fix
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Verify LilyPond output has correct slur syntax for 3-note pattern', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 1 2 3
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  // Select all notes
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }

  // Apply slur
  await page.keyboard.press('Alt+S');
  await page.waitForTimeout(500);

  // Open LilyPond tab
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');

  console.log('\n=== LILYPOND OUTPUT ===');
  console.log(lilypondText);
  console.log('=== END ===\n');

  // Check for slur syntax
  if (lilypondText.includes('(')) {
    console.log('✓ LilyPond contains opening slur parenthesis "("');
  } else {
    console.log('✗ LilyPond missing opening slur parenthesis "("');
  }

  if (lilypondText.includes(')')) {
    console.log('✓ LilyPond contains closing slur parenthesis ")"');
  } else {
    console.log('✗ LilyPond missing closing slur parenthesis ")"');
  }

  // The slur should span all 3 notes
  // LilyPond syntax: c4 ( d e )
  // Or with full syntax: c4 \( d e \)

  expect(lilypondText.includes('(') || lilypondText.includes('\\(')).toBe(true);
  expect(lilypondText.includes(')') || lilypondText.includes('\\)')).toBe(true);

  console.log('✓ LilyPond slur syntax verified');
});

test('Verify LilyPond output for 5-note pattern with slur', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type: 1 2 3 4 5
  await editor.click();
  await page.keyboard.type('1 2 3 4 5');
  await page.waitForTimeout(300);

  // Select all notes
  await page.keyboard.press('Home');
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }

  // Apply slur
  await page.keyboard.press('Alt+S');
  await page.waitForTimeout(500);

  // Open LilyPond tab
  await openTab(page, 'tab-lilypond');
  const lilypondText = await readPaneText(page, 'pane-lilypond');

  console.log('\n=== LILYPOND OUTPUT (5-note) ===');
  console.log(lilypondText);
  console.log('=== END ===\n');

  // Should have matching slur markers
  const openCount = (lilypondText.match(/[(\(]/g) || []).length;
  const closeCount = (lilypondText.match(/[)\)]/g) || []).length;

  console.log(`Open slur markers: ${openCount}`);
  console.log(`Close slur markers: ${closeCount}`);

  expect(openCount).toBeGreaterThan(0);
  expect(closeCount).toBeGreaterThan(0);
  expect(openCount).toBe(closeCount);

  console.log('✓ LilyPond slur syntax verified with matching markers');
});
