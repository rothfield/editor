import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

/**
 * Test case: 1²³ ⁴56
 *
 * Expected anchoring:
 * - Superscripts 23 anchor AFTER pitch 1 (after-grace notes)
 * - Superscript 4 anchors BEFORE pitch 5 (before-grace note)
 * - Pitch 6 is standalone
 *
 * Result: 3 regular notes (1, 5, 6), 2 after-grace (2, 3), 1 before-grace (4)
 */
test('Grace notes with spacing: 1²³ ⁴56 - after-grace 23 on 1, before-grace 4 on 5', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Grace]') || text.includes('IR:') || text.includes('grace')) {
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

  // Type "123 456" - two beats
  await page.keyboard.type('123 456');
  await page.waitForTimeout(200);

  // First: Make "23" into after-grace notes of "1"
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // past 1
  await page.keyboard.press('Shift+ArrowRight'); // select 2
  await page.keyboard.press('Shift+ArrowRight'); // select 3
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament (after-grace of 1)
  await page.waitForTimeout(300);

  // Now we have: 1²³ 456
  // Make "4" into a before-grace of "5"
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft'); // before 6
  await page.keyboard.press('ArrowLeft'); // before 5
  await page.keyboard.press('Shift+ArrowLeft'); // select 4
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament (before-grace of 5)
  await page.waitForTimeout(500);

  // Now we should have: 1²³ ⁴56
  await page.waitForTimeout(500);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/grace-mixed-spacing.png', fullPage: true });

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML ===');
  console.log(musicXML);

  // Check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');
  console.log('=== LilyPond ===');
  console.log(lilypond);

  // Print debug logs
  console.log('=== Debug Logs ===');
  for (const log of logs) {
    console.log(log);
  }

  // Count grace notes
  const afterGraceCount = (musicXML.match(/steal-time-previous/g) || []).length;
  const totalGraceCount = (musicXML.match(/<grace/g) || []).length;
  const beforeGraceCount = totalGraceCount - afterGraceCount;

  console.log('After-grace notes (steal-time-previous):', afterGraceCount);
  console.log('Before-grace notes (no steal-time):', beforeGraceCount);
  console.log('Total grace notes:', totalGraceCount);

  // Count regular notes (non-grace <note> elements)
  // A regular note has <note> without <grace> child
  const noteMatches = musicXML.match(/<note[^>]*>[\s\S]*?<\/note>/g) || [];
  const regularNotes = noteMatches.filter(n => !n.includes('<grace')).length;
  console.log('Regular notes:', regularNotes);

  // Expectations:
  // - 2 after-grace notes (2, 3) attached to pitch 1
  // - 1 before-grace note (4) attached to pitch 5
  // - 3 regular notes (1, 5, 6)
  expect(afterGraceCount).toBe(2);  // 2 and 3 are after-grace
  expect(beforeGraceCount).toBe(1); // 4 is before-grace
  expect(totalGraceCount).toBe(3);  // Total 3 grace notes
  expect(regularNotes).toBe(3);     // 1, 5, 6 are regular notes
});
