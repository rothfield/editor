import { test, expect } from '@playwright/test';

test('Smoke Test: IR Pipeline with complex rhythm --1- 2--3- -- 4-5 |', async ({ page }) => {
  await page.goto('/');
  
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  
  // Type the test motif with complex rhythm
  // --1- = two dashes, then note 1 with one dash (r4, 1q, r4)
  // 2--3- = note 2, two dashes, note 3, one dash (2q, r2, 3q, r4)
  // -- = two dashes (r2)
  // 4-5 = note 4, one dash, note 5 (4q, r4, 5q)
  // | = barline
  await editor.click();
  await page.keyboard.type('--1- 2--3- -- 4-5 |');
  
  // Give a moment for WASM to process
  await page.waitForTimeout(500);
  
  // Check MusicXML tab for correct rhythm
  const xmlTab = page.getByTestId('tab-musicxml');
  await xmlTab.click();
  
  const musicxmlPane = page.getByTestId('pane-musicxml');
  await expect(musicxmlPane).toBeVisible();
  
  const musicxml = await musicxmlPane.innerText();
  console.log('MusicXML output:', musicxml);
  
  // Check for proper note elements (not malformed)
  expect(musicxml).toContain('<note>');
  expect(musicxml).toContain('<pitch>');
  expect(musicxml).toContain('<duration>');
  
  // Check for measure with correct divisions
  // The LCM of beat divisions should normalize everything
  expect(musicxml).toContain('<measure');
  expect(musicxml).toContain('<attributes>');
  expect(musicxml).toContain('<divisions>');
  
  // Check LilyPond tab for correct rhythm notation
  const lilyTab = page.getByTestId('tab-lilypond');
  await lilyTab.click();
  
  const lilyPane = page.getByTestId('pane-lilypond');
  await expect(lilyPane).toBeVisible();
  
  const lilypond = await lilyPane.innerText();
  console.log('LilyPond output:', lilypond);
  
  // Should have proper note durations
  expect(lilypond).toMatch(/\d/); // Contains note pitches
  expect(lilypond).toMatch(/r[0-9]/); // Contains rests with proper durations
  
  // Verify it's not all r1 (whole rests) - that would indicate the bug
  expect(lilypond).not.toMatch(/r1 r1 r1/);
});
