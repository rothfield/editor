import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Dash FSM: -- 12 should output rest, then two notes', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "-- 12  " pattern - leading rest (--), two notes (1, 2)
  await page.keyboard.type('-- 12  ');
  await page.waitForTimeout(300);

  // Check MusicXML export
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  console.log('MusicXML output:\n', musicxml);

  // Count notes and rests
  const noteMatches = musicxml.match(/<note>/g) || [];
  const restMatches = musicxml.match(/<rest\/>/g) || [];

  console.log(`Total <note> elements: ${noteMatches.length}`);
  console.log(`Rest elements: ${restMatches.length}`);

  // Expected: 1 rest (the leading "--") + 2 notes (1, 2)
  expect(restMatches.length).toBe(1);  // The leading "--"
  expect(noteMatches.length).toBe(2);  // "1" and "2"
});
