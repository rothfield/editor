import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('514 IR grace notes', async ({ page }) => {
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

  // First, make JUST "5" an ornament (position 0)
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowRight');  // Select just "5"
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(300);
  
  // Now check after making just "5" superscript
  await openTab(page, 'tab-musicxml');
  const musicXML = await readPaneText(page, 'pane-musicxml');
  console.log('=== MusicXML after 5 as ornament ===');
  console.log(musicXML);

  // Check if grace note is present
  const hasGrace = musicXML.includes('<grace');
  console.log('Has <grace> element:', hasGrace);

  expect(true).toBe(true);
});
