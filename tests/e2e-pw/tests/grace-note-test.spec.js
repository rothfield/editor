import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('514 grace note export', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "514"
  await page.keyboard.type('514');
  await page.waitForTimeout(100);

  // Select "51" (first two chars) and make them ornaments (grace notes before "4")
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(300);

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML ===');
  console.log(musicXML);

  // Verify grace notes in MusicXML
  expect(musicXML).toContain('<grace/>');
  // Count grace notes - should have 2 (for "5" and "1")
  const graceCount = (musicXML.match(/<grace\/>/g) || []).length;
  console.log('Grace note count:', graceCount);
  expect(graceCount).toBe(2);

  // Check LilyPond
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');
  console.log('=== LilyPond ===');
  console.log(lilypond);

  // Verify grace notes in LilyPond
  expect(lilypond).toContain('\\grace');
  // Count grace notes in LilyPond - should have 2
  const graceCountLy = (lilypond.match(/\\grace/g) || []).length;
  console.log('LilyPond grace count:', graceCountLy);
  expect(graceCountLy).toBe(2);

  // Check DocModel
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');
  console.log('=== DocModel ===');
  console.log(docmodel);
});
