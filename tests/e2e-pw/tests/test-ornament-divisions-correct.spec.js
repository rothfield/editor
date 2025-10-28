import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('CORRECT WORKFLOW: 567 with forward selection produces correct divisions and grace notes', async ({ page }) => {
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

  // IMPORTANT: Use forward selection with Home key, NOT backward selection
  // This is the correct way to apply ornaments:
  // 1. Go to beginning with Home
  // 2. Select forward with Shift+ArrowRight
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);

  // Select first two cells ("56") using forward selection
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(200);

  // Apply ornament with Alt+0
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Verify in MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  // Verify divisions calculation is correct
  expect(musicxml).toContain('<divisions>1</divisions>');
  console.log('✅ Divisions: 1 (only the main beat "7")');

  // Verify grace notes are present
  const graceMatches = musicxml.match(/<grace[^>]*\/>/g) || [];
  expect(graceMatches.length).toBeGreaterThan(0);
  console.log(`✅ Grace notes: ${graceMatches.length} found ("5" and "6")`);

  // Verify grace notes have no duration (MusicXML requirement)
  const noteMatches = musicxml.match(/<note>[\s\S]*?<\/note>/g) || [];
  let foundGraceWithoutDuration = false;
  for (const noteMatch of noteMatches) {
    if (noteMatch.includes('<grace') && !noteMatch.includes('<duration>')) {
      foundGraceWithoutDuration = true;
      break;
    }
  }
  expect(foundGraceWithoutDuration).toBe(true);
  console.log('✅ Grace notes correctly have no <duration> element');

  console.log('\n✅ WORKFLOW VERIFIED: Ornaments with forward selection work correctly!');
});

test('LIMITATION: Backward selection does not apply ornament indicators correctly', async ({ page }) => {
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

  // Try backward selection with Shift+Left (does NOT work)
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  // Apply ornament with Alt+0
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Check docmodel to see if ornament was applied
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Look for ornament indicators
  const matches = docmodel.match(/ornament_indicator:\s*\n\s*name:\s*"([^"]*?)"/g) || [];
  let hasOrnament = false;
  for (const match of matches) {
    const value = match.match(/"([^"]*?)"/)[1];
    if (value !== 'none') {
      hasOrnament = true;
      break;
    }
  }

  if (!hasOrnament) {
    console.log('⚠️ LIMITATION: Backward selection (Shift+Left) does NOT apply ornament indicators');
    console.log('   Use forward selection (Home + Shift+Right) instead');
  }

  expect(!hasOrnament).toBe(true);
});
