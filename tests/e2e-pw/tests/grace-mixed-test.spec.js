import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Mixed after-grace and before-grace notes positioned correctly', async ({ page }) => {
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

  // Type two separate beats with ornaments:
  // Beat 1: "12" then make "2" an ornament of "1" (after-grace)
  // Beat 2: "34" then make "3" an ornament before "4" (before-grace)
  //
  // Result should be: 1² ³4
  //   - Note 1 with after-grace 2 on right
  //   - Note 4 with before-grace 3 on left

  // First beat: create after-grace
  await page.keyboard.type('12');
  await page.waitForTimeout(200);
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight'); // past 1
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight'); // select 2
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament (after-grace of 1)
  await page.waitForTimeout(500);

  // Add space and second beat
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  await page.keyboard.type(' 34');
  await page.waitForTimeout(200);

  // Select "3" and make it an ornament (before-grace of 4)
  await page.keyboard.press('ArrowLeft'); // before 4
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowLeft'); // select 3
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O'); // Make ornament
  await page.waitForTimeout(500);

  // Wait for rendering
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: 'artifacts/grace-mixed-test.png', fullPage: true });

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML ===');
  console.log(musicXML);

  // Count grace notes with and without steal-time-previous
  const afterGraceCount = (musicXML.match(/steal-time-previous/g) || []).length;
  const totalGraceCount = (musicXML.match(/<grace/g) || []).length;
  const beforeGraceCount = totalGraceCount - afterGraceCount;

  console.log('After-grace notes (steal-time-previous):', afterGraceCount);
  console.log('Before-grace notes (no steal-time):', beforeGraceCount);
  console.log('Total grace notes:', totalGraceCount);

  // Print debug logs
  console.log('=== Debug Logs ===');
  for (const log of logs) {
    console.log(log);
  }

  // Verify we have 1 after-grace note (2) and 1 before-grace note (3)
  expect(afterGraceCount).toBe(1);
  expect(beforeGraceCount).toBe(1);

  // Count transforms - should be 1 (for the after-grace group)
  const transformLogs = logs.filter(log => log.includes('Set transform'));
  console.log('Transforms applied:', transformLogs.length);
  expect(transformLogs.length).toBe(1);

  // Verify before-grace was skipped
  const skippedLogs = logs.filter(log => log.includes('Skipping before-grace'));
  console.log('Before-grace groups skipped:', skippedLogs.length);
  expect(skippedLogs.length).toBe(1);
});
