import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug: Check extracted beats for MusicXML', async ({ page }) => {
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

  // Get cells and beats via console.log in a way we can see
  // We'll use the browser's internal API by checking MusicXML output

  // Open MusicXML to see what gets exported
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  console.log('MusicXML notes count:', (musicxml.match(/<note>/g) || []).length);
  console.log('MusicXML has <grace>:', musicxml.includes('<grace'));
  console.log('MusicXML has <ornament>:', musicxml.includes('<ornament'));

  // Print all <note> elements
  const noteMatches = musicxml.match(/<note>[\s\S]*?<\/note>/g);
  if (noteMatches) {
    console.log('All notes in MusicXML:');
    noteMatches.forEach((note, i) => {
      console.log(`Note ${i}:\n${note.substring(0, 300)}\n---`);
    });
  }

  expect(musicxml.length).toBeGreaterThan(0);
});
