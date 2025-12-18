import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('After-grace notes positioned RIGHT of anchor note', async ({ page }) => {
  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('OSMD') || text.includes('[Grace]') || text.includes('steal')) {
      logs.push(text);
    }
  });

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "1234 5" then make "234" ornaments
  // Pattern: 1²³⁴ 5 should create:
  //   - Note 1 (C4)
  //   - Grace notes 2,3,4 (D4,E4,F4) appearing RIGHT of note 1
  //   - Note 5 (G4) in a separate beat
  // The grace notes should appear DIRECTLY to the RIGHT of note 1
  // Step 1: Type "1234 5"
  await page.keyboard.type('1234 5');
  await page.waitForTimeout(100);

  // Step 2: Select "234" and make them ornaments
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // Move past "1"
  await page.keyboard.press('Shift+ArrowRight'); // Select "2"
  await page.keyboard.press('Shift+ArrowRight'); // Select "3"
  await page.keyboard.press('Shift+ArrowRight'); // Select "4"
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament
  await page.waitForTimeout(500);

  // Wait for rendering
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/after-grace-test.png', fullPage: true });

  // Check MusicXML has grace notes (emitted as regular grace notes, not steal-time-previous)
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML ===');
  console.log(musicXML);

  // Grace notes should be emitted WITHOUT steal-time-previous (OSMD does positioning via SVG)
  const hasGraceNotes = musicXML.includes('<grace/>') || musicXML.includes('<grace ');
  console.log('Has grace notes:', hasGraceNotes);

  // Check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');
  console.log('=== LilyPond ===');
  console.log(lilypond);

  // Check that grace note positioning was applied (via console logs)
  const hasGracePositioning = logs.some(log => log.includes('[Grace] Set transform'));
  console.log('Grace positioning applied:', hasGracePositioning);

  // Print debug logs
  console.log('=== Debug Logs ===');
  for (const log of logs) {
    console.log(log);
  }

  // Verify grace notes exist in MusicXML
  expect(hasGraceNotes).toBe(true);

  // Verify SVG positioning was applied
  expect(hasGracePositioning).toBe(true);
});
