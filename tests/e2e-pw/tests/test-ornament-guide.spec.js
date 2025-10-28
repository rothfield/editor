import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('GUIDE: How to apply ornaments correctly', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         HOW TO APPLY ORNAMENTS IN THE MUSIC EDITOR            ║
╚═══════════════════════════════════════════════════════════════╝

✅ CORRECT WORKFLOW (USE THIS):
  1. Type your notes: 123
  2. Press Home (go to beginning)
  3. Press Shift+Right to select cells forward
  4. Press Alt+0 to apply ornament

  Result: Grace notes appear in MusicXML ✓

❌ DOES NOT WORK (AVOID THIS):
  1. Type your notes: 123
  2. Press Shift+Left to select cells backward
  3. Press Alt+0 to apply ornament

  Result: Ornament not applied (known limitation)

📝 IMPORTANT NOTES:
  • Ornaments do NOT count in beat divisions
  • Ornaments do NOT create tuplets
  • Ornaments export as <grace slash="yes"/> in MusicXML
  • Grace notes have NO <duration> element (MusicXML requirement)
  • Ornaments work with space-separated beats: "1 2 3" ✓
  • Ornaments work with numbers: "123" ✓
`);

  // Demo: Forward selection
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  await editor.click();
  await page.keyboard.type('567');
  await page.waitForTimeout(300);

  // Forward selection
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Verify
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  const graceMatches = musicxml.match(/<grace[^>]*\/>/g) || [];
  const divisionsMatch = musicxml.match(/<divisions>(\d+)<\/divisions>/);
  const timeModMatches = musicxml.match(/<time-modification>/g) || [];

  console.log(`\n✅ VERIFICATION:
  • Grace notes present: ${graceMatches.length > 0 ? '✓ YES' : '✗ NO'}
  • Divisions: ${divisionsMatch ? divisionsMatch[1] : '?'}
  • Time-modification (tuplet): ${timeModMatches.length > 0 ? '✗ PRESENT (wrong)' : '✓ ABSENT (correct)'}
  `);

  expect(graceMatches.length).toBeGreaterThan(0);
  expect(divisionsMatch && divisionsMatch[1] === '1').toBe(true);
  expect(timeModMatches.length).toBe(0);

  console.log('\n✅ SUCCESS: Ornaments working correctly!');
});
