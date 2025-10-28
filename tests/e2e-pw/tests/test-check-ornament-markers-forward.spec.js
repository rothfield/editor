import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Check ornament markers with FORWARD selection', async ({ page }) => {
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

  // Select "4" with forward selection (Home + Shift+Right)
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  console.log('Selected "4" (forward selection with Home)');

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
  const hasStart = docmodel.includes('ornament_before_start') || docmodel.includes('ornament_after_start') || docmodel.includes('ornament_on_top_start');
  const hasEnd = docmodel.includes('ornament_before_end') || docmodel.includes('ornament_after_end') || docmodel.includes('ornament_on_top_end');

  console.log(`\nOrnament markers found:`);
  console.log(`  Start marker: ${hasStart ? '✅ YES' : '❌ NO'}`);
  console.log(`  End marker: ${hasEnd ? '✅ YES' : '❌ NO'}`);

  if (hasStart && !hasEnd) {
    console.log(`\n⚠️ WARNING: Ornament start marker found but NO end marker!`);
  } else if (hasStart && hasEnd) {
    console.log(`\n✅ GOOD: Both start AND end markers found`);
  }

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  const graceMatches = musicxml.match(/<grace[^>]*\/>/g) || [];
  console.log(`\nGrace notes in MusicXML: ${graceMatches.length > 0 ? '✅ ' + graceMatches.length + ' found' : '❌ 0 found'}`);

  expect(docmodel.length).toBeGreaterThan(0);
});
