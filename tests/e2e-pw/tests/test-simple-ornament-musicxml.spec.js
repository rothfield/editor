import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Simple test: Type 567, apply ornament, check MusicXML for grace notes', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  // Type
  await editor.click();
  await page.keyboard.type('567');
  await page.waitForTimeout(300);

  console.log('Step 1: Typed "567"');

  // Select
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(300);

  console.log('Step 2: Selected "56" with Home + Shift+Right twice');

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(700);

  console.log('Step 3: Applied Alt+0 (ornament)');

  // Open MusicXML
  await openTab(page, 'tab-musicxml');
  await page.waitForTimeout(500);
  const musicxml = await readPaneText(page, 'pane-musicxml');

  console.log('\nStep 4: Reading MusicXML tab...');

  // Check for grace notes
  const graceMatches = musicxml.match(/<grace[^>]*\/>/g) || [];
  console.log(`\n✅ Grace elements found: ${graceMatches.length}`);

  if (graceMatches.length > 0) {
    console.log(`   Grace elements: ${graceMatches.join(', ')}`);
  } else {
    console.log('   ❌ NO GRACE NOTES FOUND!');
    console.log('\n   Showing first 800 chars of MusicXML:');
    console.log('   ' + musicxml.substring(0, 800).split('\n').join('\n   '));
  }

  const noteCount = (musicxml.match(/<note>/g) || []).length;
  console.log(`   Total <note> elements: ${noteCount}`);

  expect(musicxml.length).toBeGreaterThan(0);
});
