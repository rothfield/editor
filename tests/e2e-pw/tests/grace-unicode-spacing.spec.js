import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

/**
 * Test case: Direct Unicode superscript input "1²³ ⁴56"
 *
 * Tests that typing actual superscript Unicode characters with spacing
 * correctly anchors grace notes:
 * - Superscripts ²³ anchor AFTER pitch 1 (after-grace notes)
 * - Superscript ⁴ anchors BEFORE pitch 5 (before-grace note)
 * - Pitch 6 is standalone
 */
test('Direct Unicode superscript input: 1²³ ⁴56', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Grace]') || text.includes('IR:') || text.includes('grace') || text.includes('superscript')) {
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

  // Type the exact Unicode string: 1²³ ⁴56
  // Unicode superscripts: ² (U+00B2), ³ (U+00B3), ⁴ (U+2074)
  await page.keyboard.type('1²³ ⁴56');
  await page.waitForTimeout(500);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/grace-unicode-spacing.png', fullPage: true });

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

  // Count regular notes
  const noteMatches = musicXML.match(/<note[^>]*>[\s\S]*?<\/note>/g) || [];
  const regularNotes = noteMatches.filter(n => !n.includes('<grace')).length;
  console.log('Regular notes:', regularNotes);

  // Expectations:
  // - 2 after-grace notes (²³ = 2, 3) attached to pitch 1
  // - 1 before-grace note (⁴ = 4) attached to pitch 5
  // - 3 regular notes (1, 5, 6)
  expect(afterGraceCount).toBe(2);  // ² and ³ are after-grace
  expect(beforeGraceCount).toBe(1); // ⁴ is before-grace
  expect(totalGraceCount).toBe(3);  // Total 3 grace notes
  expect(regularNotes).toBe(3);     // 1, 5, 6 are regular notes
});
