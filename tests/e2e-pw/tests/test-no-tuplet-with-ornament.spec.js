import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Verify: No tuplet/time-modification with ornaments', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Setup
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "567"
  await editor.click();
  await page.keyboard.type('567');
  await page.waitForTimeout(300);

  // Forward selection: Home + Shift+Right twice → selects "56"
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  // Parse and inspect each note
  const noteMatches = musicxml.match(/<note>[\s\S]*?<\/note>/g) || [];

  console.log(`Found ${noteMatches.length} notes`);

  let hasTimeModification = false;
  noteMatches.forEach((note, idx) => {
    const hasGrace = note.includes('<grace');
    const hasTimeModif = note.includes('<time-modification>');

    if (hasTimeModif) {
      hasTimeModification = true;
      console.log(`Note ${idx}: ${hasGrace ? 'GRACE' : 'regular'} - ❌ HAS time-modification (WRONG!)`);
      console.log(`  Content: ${note.substring(0, 200)}`);
    } else {
      console.log(`Note ${idx}: ${hasGrace ? 'GRACE' : 'regular'} - ✅ No time-modification`);
    }
  });

  // Main note (7) should NOT have time-modification
  expect(hasTimeModification).toBe(false);
  console.log('\n✅ SUCCESS: No tuplet/time-modification generated when ornaments are present');
});
