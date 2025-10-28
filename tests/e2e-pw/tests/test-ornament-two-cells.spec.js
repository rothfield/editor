import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Select TWO cells and apply ornament', async ({ page }) => {
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

  // Select "4 5" (two cells) with forward selection
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  console.log('Selected "4 5 " (TWO cells with Home + Shift+Right 3 times)');

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  console.log('Applied Alt+0');

  // Check docmodel
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Count ornament markers
  const startMatches = docmodel.match(/ornament_\w*_start/g) || [];
  const endMatches = docmodel.match(/ornament_\w*_end/g) || [];

  console.log(`\nOrnament markers found:`);
  console.log(`  Start markers: ${startMatches.length}`);
  console.log(`  End markers: ${endMatches.length}`);

  if (startMatches.length > 0) {
    startMatches.forEach(m => console.log(`    - ${m}`));
  }
  if (endMatches.length > 0) {
    endMatches.forEach(m => console.log(`    - ${m}`));
  }

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  const graceMatches = musicxml.match(/<grace[^>]*\/>/g) || [];
  console.log(`\nGrace notes in MusicXML: ${graceMatches.length > 0 ? '✅ ' + graceMatches.length + ' found' : '❌ 0 found'}`);

  expect(docmodel.length).toBeGreaterThan(0);
});
