import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Select only SECOND cell "5" and apply ornament', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  // Type "4 5 6"
  await editor.click();
  await page.keyboard.type('4 5 6');
  await page.waitForTimeout(300);

  console.log('Typed: "4 5 6"');

  // Go to position before "5" and select only "5 " (backward)
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  console.log('Selected "5 6" (backward from end)');

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  console.log('Applied Alt+0');

  // Check docmodel
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Look for ornament indicators
  const startMatches = docmodel.match(/ornament_\w*_start/g) || [];
  const endMatches = docmodel.match(/ornament_\w*_end/g) || [];

  console.log(`\nOrnament markers:`);
  console.log(`  Start: ${startMatches.length > 0 ? '✅ ' + startMatches[0] : '❌ none'}`);
  console.log(`  End: ${endMatches.length > 0 ? '✅ ' + endMatches[0] : '❌ none'}`);

  if (startMatches.length === 0 && endMatches.length === 0) {
    console.log(`\n❌ No ornament markers found`);
  } else if (startMatches.length > 0 && endMatches.length === 0) {
    console.log(`\n⚠️ Start marker found but NO end marker`);
    console.log(`   This might break grace note detection`);
  }

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  const graceMatches = musicxml.match(/<grace[^>]*\/>/g) || [];
  console.log(`\nGrace notes in MusicXML: ${graceMatches.length > 0 ? '✅ ' + graceMatches.length : '❌ 0'}`);

  expect(docmodel.length).toBeGreaterThan(0);
});
