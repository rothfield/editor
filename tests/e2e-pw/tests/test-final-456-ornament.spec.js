import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Final Test: 456 with 56 as ornaments shows grace notes', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  // Type "456"
  await editor.click();
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Select "56" (forward selection)
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight');  // Move to "5"
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');  // Start selection
  await page.keyboard.press('Shift+ArrowRight');  // Select "56"
  await page.waitForTimeout(200);

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(700);

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  const graceMatches = musicxml.match(/<grace[^>]*\/>/g) || [];
  const noteMatches = musicxml.match(/<note>/g) || [];

  console.log(`
╔════════════════════════════════════════╗
║  TEST: "456" with ornament on "56"    ║
╚════════════════════════════════════════╝

Input: Type "456"
Action: Select "56" and press Alt+0

Result:
  Grace elements: ${graceMatches.length}
  Total notes: ${noteMatches.length}

${graceMatches.length > 0 ? '✅ SUCCESS: Grace notes ARE appearing!' : '❌ Grace notes NOT showing'}
  `);

  expect(graceMatches.length).toBeGreaterThan(0);
});
