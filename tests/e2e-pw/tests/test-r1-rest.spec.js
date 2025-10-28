import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('r1 should be rest for 1 beat', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "r1" - should be rest for 1 beat
  await page.keyboard.type('r1');
  await page.waitForTimeout(300);

  // Check LilyPond export
  await openTab(page, 'tab-lilypond');
  const lilypond = await readPaneText(page, 'pane-lilypond');

  console.log('LilyPond output:\n', lilypond);

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  console.log('\nMusicXML output:\n', musicxml);

  // Expected: rest for 1 beat + note
  const restMatches = musicxml.match(/<rest\/>/g) || [];
  const noteMatches = musicxml.match(/<note>/g) || [];

  console.log(`\nRests: ${restMatches.length}, Notes: ${noteMatches.length}`);
});
