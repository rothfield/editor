import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('diagnostic: ornament layout mode switching', async ({ page }) => {
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type content: "Hello"
  await page.keyboard.type('Hello');

  // Use JavaScript to directly set selection (cells 1-3 = "ell")
  // This bypasses the Shift+Arrow keyboard issue
  await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    // Set selection using cell indices
    app.editor.initializeSelection(1, 3); // Select cells 1, 2, 3 (e, l, l)
  });

  // Apply ornament using Alt+o (correct way!)
  await page.keyboard.press('Alt+o');

  // Wait for layout to update
  await page.waitForTimeout(500);

  // Check Display List tab
  await openTab(page, 'tab-displaylist');
  const displayList = await readPaneText(page, 'pane-displaylist');

  console.log('=== DISPLAY LIST (Mode: OFF - should be locked) ===');
  console.log(displayList);

  // Print captured console logs from the app
  console.log('\n=== BROWSER CONSOLE LOGS ===');
  consoleLogs.forEach(log => {
    console.log(log);
  });

  // Check that ornaments were extracted to the ornaments array
  const ornamentMatches = displayList.matchAll(/"text":\s*"([^"]+)"[^}]*?"x":\s*([\d.]+)/g);
  const ornaments = Array.from(ornamentMatches).map(m => ({
    text: m[1],
    x: parseFloat(m[2])
  }));

  console.log('\n=== EXTRACTED ORNAMENTS ===');
  ornaments.forEach(o => {
    console.log(`Ornament "${o.text}" at x=${o.x}`);
  });

  // Should have extracted ornaments in the ornaments array
  console.log(`\nExtracted ornaments: ${ornaments.length}`);

  expect(ornaments.length).toBeGreaterThan(0);

  // Verify ornaments contain the expected characters (e, l, l)
  const ornamentText = ornaments.map(o => o.text).join('');
  console.log(`Ornament content: "${ornamentText}"`);
  expect(ornamentText).toContain('e');
});
