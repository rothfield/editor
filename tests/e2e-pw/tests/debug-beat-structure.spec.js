import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug: Check beats from beat deriver', async ({ page }) => {
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

  // Check displaylist which should show beat structure
  await openTab(page, 'tab-displaylist');
  const displaylist = await readPaneText(page, 'pane-displaylist');

  // Look for beat information
  if (displaylist.includes('beats')) {
    const beatMatch = displaylist.match(/"beats":\s*\[([\s\S]*?)\]/);
    if (beatMatch) {
      console.log('Beat structure:');
      console.log(beatMatch[0].substring(0, 2000));
    }
  } else {
    console.log('First 2000 chars of displaylist:');
    console.log(displaylist.substring(0, 2000));
  }

  expect(displaylist.length).toBeGreaterThan(0);
});
