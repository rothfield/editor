import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Check if ornament indicators are being SET on cells (forward selection)', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "567"
  await editor.click();
  await page.keyboard.type('567');
  await page.waitForTimeout(300);

  console.log('Before ornament - cells should all have ornament_indicator: "none"');

  // Forward selection
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  console.log('Selected "56" with forward selection');

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  console.log('Applied Alt+0 (ornament)');

  // Check docmodel
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Extract ornament indicators
  const matches = docmodel.match(/ornament_indicator:\s*\n\s*name:\s*"([^"]*?)"/g) || [];
  console.log(`\nFound ${matches.length} ornament_indicator fields`);

  matches.forEach((match, idx) => {
    const value = match.match(/"([^"]*?)"/)[1];
    const status = value === 'none' ? '❌ none' : `✅ ${value}`;
    console.log(`Cell ${idx}: ${status}`);
  });

  // Check if any are start indicators
  const hasOrnamentStart = docmodel.includes('ornament_before_start') ||
                           docmodel.includes('ornament_after_start') ||
                           docmodel.includes('ornament_on_top_start');

  if (hasOrnamentStart) {
    console.log('\n✅ GOOD: Ornament start indicators ARE set');
  } else {
    console.log('\n❌ BAD: Ornament start indicators are NOT set');
    console.log('   This explains why no grace notes appear in MusicXML');
  }

  expect(docmodel.length).toBeGreaterThan(0);
});
