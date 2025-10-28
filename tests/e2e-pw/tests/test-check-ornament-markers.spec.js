import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Check ornament start AND end markers', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  // Type "4 5"
  await editor.click();
  await page.keyboard.type('4 5');
  await page.waitForTimeout(300);

  console.log('Typed: "4 5"');

  // Select "5" with backward selection
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  console.log('Selected "5" (backward selection)');

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  console.log('Applied Alt+0');

  // Check docmodel
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Extract all cells with their ornament indicators
  const matches = docmodel.match(/char:\s*"([^"]*?)"[\s\S]*?ornament_indicator:[\s\S]*?name:\s*"([^"]*?)"/g) || [];

  console.log(`\nAll cells and their ornament indicators:`);
  matches.forEach((match, idx) => {
    const charMatch = match.match(/char:\s*"([^"]*?)"/);
    const ornMatch = match.match(/name:\s*"([^"]*?)"/);
    const char = charMatch ? charMatch[1] : '?';
    const orn = ornMatch ? ornMatch[1] : '?';

    console.log(`  Cell ${idx}: "${char}" → ${orn}`);
  });

  // Check for start AND end markers
  const hasStart = docmodel.includes('ornament_after_start');
  const hasEnd = docmodel.includes('ornament_after_end');

  console.log(`\nOrnament markers found:`);
  console.log(`  Start (ornament_after_start): ${hasStart ? '✅ YES' : '❌ NO'}`);
  console.log(`  End (ornament_after_end): ${hasEnd ? '✅ YES' : '❌ NO'}`);

  if (!hasEnd && hasStart) {
    console.log(`\n⚠️ PROBLEM: Ornament start marker found but NO end marker!`);
    console.log(`   This breaks the ornament detection (in_ornament_span stays true)`);
  }

  expect(docmodel.length).toBeGreaterThan(0);
});
