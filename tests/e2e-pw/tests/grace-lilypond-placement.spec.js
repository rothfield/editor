import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

/**
 * Test case: LilyPond output for "1²³ ⁴56"
 *
 * Expected LilyPond structure:
 * - c'4 (pitch 1 - anchor)
 * - \afterGrace { d'8 e'8 } (after-grace 2, 3 attached to 1)
 * - \grace f'8 (before-grace 4 attached to 5)
 * - g'8 a'8 (pitches 5, 6)
 *
 * The key issue: after-grace notes should use \afterGrace, not \grace
 */
test('LilyPond grace placement: 1²³ ⁴56', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    logs.push('[' + msg.type() + '] ' + msg.text());
  });

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "123 456"
  await page.keyboard.type('123 456');
  await page.waitForTimeout(200);

  // Make "23" into superscripts (after-grace of 1)
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // past 1
  await page.keyboard.press('Shift+ArrowRight'); // select 2
  await page.keyboard.press('Shift+ArrowRight'); // select 3
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(300);

  // Make "4" into superscript (before-grace of 5)
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft'); // before 6
  await page.keyboard.press('ArrowLeft'); // before 5
  await page.keyboard.press('Shift+ArrowLeft'); // select 4
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(500);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/grace-lilypond-placement.png', fullPage: true });

  // Check LilyPond output
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');
  console.log('=== LilyPond Output ===');
  console.log(lilypond);

  // Check MusicXML for comparison
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML Output ===');
  console.log(musicXML);

  // Print relevant logs
  const relevantLogs = logs.filter(l =>
    l.includes('grace') || l.includes('Grace') || l.includes('IR') || l.includes('lilypond')
  );
  console.log('=== Relevant Logs ===');
  for (const log of relevantLogs) {
    console.log(log);
  }

  // LilyPond assertions:
  // 1. The anchor note c' (pitch 1) should appear BEFORE its after-grace notes
  // 2. After-grace notes (d', e') should use \afterGrace syntax, not \grace
  // 3. Before-grace note (f') should use \grace and appear before g'

  // Check that we have the main note c' (pitch 1)
  expect(lilypond).toContain("c'");

  // Check for grace notes d' and e' (pitches 2, 3)
  expect(lilypond).toContain("d'");
  expect(lilypond).toContain("e'");

  // Check for before-grace f' (pitch 4) and anchor g' (pitch 5)
  expect(lilypond).toContain("f'");
  expect(lilypond).toContain("g'");

  // CRITICAL: After-grace notes should NOT appear before their anchor
  // In LilyPond, the order should be: c' ... (after-grace d' e') ... \grace f' g' a'
  // Currently failing: all grace notes use \grace which puts them BEFORE

  // Extract the note sequence from LilyPond
  const notePattern = /\\?(?:grace|afterGrace)?\s*[a-g]'?\d*/g;
  const notes = lilypond.match(notePattern) || [];
  console.log('Note sequence:', notes);

  // Find positions
  const c_pos = lilypond.indexOf("c'");
  const d_pos = lilypond.indexOf("d'");
  const e_pos = lilypond.indexOf("e'");
  const f_pos = lilypond.indexOf("f'");
  const g_pos = lilypond.indexOf("g'");

  console.log('Positions: c=%d, d=%d, e=%d, f=%d, g=%d', c_pos, d_pos, e_pos, f_pos, g_pos);

  // After-grace notes (d', e') should come AFTER their anchor (c')
  // This is the expected behavior for after-grace in LilyPond
  expect(d_pos).toBeGreaterThan(c_pos);
  expect(e_pos).toBeGreaterThan(c_pos);

  // Before-grace note (f') should come BEFORE its anchor (g')
  expect(f_pos).toBeLessThan(g_pos);

  // CRITICAL BUG CHECK:
  // After-grace notes in LilyPond MUST use \afterGrace syntax
  // Currently: \grace d'32 \grace e'32 - this renders BEFORE g', not after c'
  // Expected: \afterGrace c'4 { d'32 e'32 } - renders after c'

  // The \grace command puts notes BEFORE the following note
  // The \afterGrace command puts notes AFTER the preceding note

  // Count \grace commands - should only be 1 (for before-grace f')
  const graceCount = (lilypond.match(/\\grace\s/g) || []).length;
  console.log('\\grace count:', graceCount);

  // Check for \afterGrace - should be present for after-grace notes
  const hasAfterGrace = lilypond.includes('\\afterGrace');
  console.log('Has \\afterGrace:', hasAfterGrace);

  // MusicXML correctly marks after-grace with steal-time-previous
  const hasStealTime = musicXML.includes('steal-time-previous');
  console.log('MusicXML has steal-time-previous:', hasStealTime);

  // FAILING ASSERTION: After-grace notes should use \afterGrace in LilyPond
  // Currently all grace notes use \grace which is incorrect for after-grace
  expect(hasAfterGrace).toBe(true); // This should FAIL - exposing the bug

  // After-grace notes (d', e') should NOT use plain \grace
  // They should be wrapped in \afterGrace { } block
  expect(graceCount).toBe(1); // Only f' should use \grace (before-grace)
});
