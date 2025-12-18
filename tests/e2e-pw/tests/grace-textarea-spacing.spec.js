import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

/**
 * Test case: Textarea input "1²³ ⁴56"
 *
 * Tests superscript anchoring with whitespace separation:
 * - "1²³" (beat 1): superscripts ²³ anchor AFTER pitch 1 (after-grace)
 * - " " (whitespace): beat boundary
 * - "⁴56" (beat 2): superscript ⁴ anchors BEFORE pitch 5 (before-grace), then 6
 *
 * Expected: 3 regular notes (1, 5, 6), 2 after-grace (2, 3), 1 before-grace (4)
 */
test('Textarea superscript spacing: 1²³ ⁴56 anchors correctly', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push('[' + msg.type() + '] ' + text);
  });

  await page.goto('/');
  await page.waitForSelector('#notation-editor');
  await page.waitForFunction(() => typeof window.musicEditor !== 'undefined');
  await page.waitForTimeout(300);

  // Focus textarea directly
  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();
  await page.evaluate(() => {
    const ta = document.querySelector('.notation-textarea');
    if (ta) {
      ta.focus();
      ta.value = '';
    }
  });
  await page.waitForTimeout(100);

  // Type: 1²³ ⁴56
  // - 1 is regular pitch
  // - ² (U+00B2), ³ (U+00B3) are superscripts (after-grace of 1)
  // - space is beat separator
  // - ⁴ (U+2074) is superscript (before-grace of 5)
  // - 5, 6 are regular pitches
  await page.keyboard.type('1²³ ⁴56');
  await page.waitForTimeout(500);

  // Check document model
  const docModel = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.getDocument?.();
    if (!doc || !doc.lines?.[0]) return { error: 'no doc' };

    const cells = doc.lines[0].cells || [];
    return {
      cellCount: cells.length,
      cells: cells.map(c => ({
        kind: c.kind?.name || 'unknown',
        char: c.char,
        charCode: c.char?.charCodeAt(0),
        pitch_code: c.pitch_code,
        is_superscript: c.is_superscript
      }))
    };
  });
  console.log('Document model:', JSON.stringify(docModel, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'artifacts/grace-textarea-spacing.png', fullPage: true });

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

  // Count grace notes in MusicXML
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

  // Print relevant logs
  const relevantLogs = logs.filter(l =>
    l.includes('superscript') || l.includes('grace') || l.includes('Grace') ||
    l.includes('anchor') || l.includes('IR')
  );
  console.log('=== Relevant Logs ===');
  for (const log of relevantLogs) {
    console.log(log);
  }

  // Expectations:
  // Beat 1 "1²³": 1 regular note + 2 after-grace notes
  // Beat 2 "⁴56": 1 before-grace + 2 regular notes
  // Total: 3 regular notes, 2 after-grace, 1 before-grace
  expect(afterGraceCount).toBe(2);  // ² and ³ are after-grace of 1
  expect(beforeGraceCount).toBe(1); // ⁴ is before-grace of 5
  expect(totalGraceCount).toBe(3);  // Total 3 grace notes
  expect(regularNotes).toBe(3);     // 1, 5, 6 are regular notes
});
