import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug: Check what cells are in beat (from MusicXML output)', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "2 3 4 1"
  await editor.click();
  await page.keyboard.type('2 3 4 1');
  await page.waitForTimeout(300);

  // Select first 3 and apply ornament
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Get both docmodel and MusicXML
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Count cells and their types
  const cellLines = docmodel.match(/cells:\n([\s\S]*?)\n      label:/)[1];
  const pitchedMatches = cellLines.match(/pitched_element/g) || [];
  const unpitchedMatches = cellLines.match(/unpitched_element/g) || [];

  console.log(`Total pitched cells: ${pitchedMatches.length}`);
  console.log(`Total unpitched cells: ${unpitchedMatches.length}`);

  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  const noteMatches = musicxml.match(/<note>/g) || [];
  console.log(`MusicXML notes exported: ${noteMatches.length}`);

  // Expected: 4 pitched cells ("2", "3", "4", "1")
  // But MusicXML only exports 2 notes ("2" and "1")
  // So "3" and "4" are being lost somewhere in beat processing

  if (noteMatches.length < pitchedMatches.length) {
    console.log(`❌ Missing ${pitchedMatches.length - noteMatches.length} notes in MusicXML export!`);
  }

  expect(musicxml.length).toBeGreaterThan(0);
});
