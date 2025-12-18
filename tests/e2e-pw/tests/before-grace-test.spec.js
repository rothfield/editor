import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Before-grace notes stay LEFT of following note (not moved)', async ({ page }) => {
  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Grace]')) {
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

  // Type "2 34" then make "3" an ornament
  // Pattern: 2 ³4 should create:
  //   - Note 2 (D4) in beat 1
  //   - Grace note 3 (E4) appearing LEFT of note 4 (before-grace)
  //   - Note 4 (F4) in beat 2
  // The grace note should STAY to the LEFT of note 4 (not moved)
  await page.keyboard.type('2 34');
  await page.waitForTimeout(100);

  // Select "3" and make it an ornament
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // past 2
  await page.keyboard.press('ArrowRight'); // past space
  await page.keyboard.press('Shift+ArrowRight'); // select 3
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament
  await page.waitForTimeout(500);

  // Wait for rendering
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/before-grace-test.png', fullPage: true });

  // Check MusicXML - before-grace notes should NOT have steal-time-previous
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML ===');
  console.log(musicXML);

  // Grace note should NOT have steal-time-previous (it's a before-grace)
  const hasStealTimePrevious = musicXML.includes('steal-time-previous');
  console.log('Has steal-time-previous:', hasStealTimePrevious);

  // Grace note should exist
  const hasGraceNotes = musicXML.includes('<grace');
  console.log('Has grace notes:', hasGraceNotes);

  // Print debug logs
  console.log('=== Debug Logs ===');
  for (const log of logs) {
    console.log(log);
  }

  // Verify before-grace notes exist but don't have steal-time-previous
  expect(hasGraceNotes).toBe(true);
  expect(hasStealTimePrevious).toBe(false);

  // Verify NO transform was applied (before-grace should not be moved)
  const hasTransform = logs.some(log => log.includes('Set transform'));
  console.log('Transform applied:', hasTransform);
  expect(hasTransform).toBe(false);
});
