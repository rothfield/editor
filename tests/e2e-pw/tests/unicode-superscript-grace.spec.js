import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Unicode superscript ⁴1 produces grace note in LilyPond export', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type Unicode superscript 4 followed by regular 1
  // ⁴ is U+2074
  await page.keyboard.type('⁴1');
  await page.waitForTimeout(100);

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML ===');
  console.log(musicXML);

  // Should have a grace note
  const hasGrace = musicXML.includes('<grace');
  console.log('Has grace element:', hasGrace);
  expect(hasGrace).toBe(true);

  // Check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');
  console.log('=== LilyPond ===');
  console.log(lilypond);

  // Should have grace note syntax (either \grace or \acciaccatura)
  const hasGraceLy = lilypond.includes('\\grace') || lilypond.includes('\\acciaccatura');
  console.log('Has grace in LilyPond:', hasGraceLy);
  expect(hasGraceLy).toBe(true);

  // The main note should be c (pitch 1)
  expect(lilypond).toMatch(/c'?\d/);
});
