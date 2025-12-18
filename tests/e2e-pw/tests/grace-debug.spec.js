import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug grace note OSMD post-processing', async ({ page }) => {
  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    if (msg.text().includes('OSMD Grace')) {
      logs.push(msg.text());
    }
  });

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "514" - then make 51 into grace notes before 4
  await page.keyboard.type('514');
  await page.waitForTimeout(100);

  // Select "51" and make ornaments
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(500);

  // Wait for OSMD to render the staff notation
  await page.waitForTimeout(1000);

  // Take screenshot to see the staff notation result
  await page.screenshot({ path: 'artifacts/grace-note-staff-view.png', fullPage: true });
  console.log('Screenshot saved to artifacts/grace-note-staff-view.png');

  // Check MusicXML for steal-time-following
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML ===');
  console.log(musicXML);

  const hasStealTime = musicXML.includes('steal-time-following');
  console.log('Has steal-time-following:', hasStealTime);

  // Print OSMD debug logs
  console.log('=== OSMD Grace Debug Logs ===');
  for (const log of logs) {
    console.log(log);
  }

  // For debugging - don't fail
  expect(true).toBe(true);
});
