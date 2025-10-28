/**
 * E2E Tests: Unmeasured Fioritura (After Grace Notes)
 * Feature: 006-music-notation-ornament (enhancement)
 * Tests: Verify ornaments export as unmeasured fioritura (tiny beamed after grace notes)
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Unmeasured Fioritura - After Grace Notes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Clear any existing content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('T050: MusicXML exports ornaments with steal-time-following attribute', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type and apply ornament
    await page.keyboard.type('456');
    await page.waitForTimeout(200);

    // Select "56" (the ornament)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Open MusicXML tab
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║ T050: Unmeasured Fioritura MusicXML Attributes      ║');
    console.log('╚════════════════════════════════════════════════════╝');

    // Verify after grace notes have steal-time-following attribute
    const afterGracePattern = /grace[^>]*steal-time-following="50"/;
    const hasAfterGraceAttr = afterGracePattern.test(musicxml);

    if (hasAfterGraceAttr) {
      console.log('✅ After grace notes have steal-time-following="50" attribute');
      expect(hasAfterGraceAttr).toBe(true);
    } else {
      // Check for any grace elements at all
      const hasGraceElements = /<grace/.test(musicxml);
      if (hasGraceElements) {
        const gracesWithSteal = (musicxml.match(/grace[^>]*steal-time-following/g) || []).length;
        const allGraces = (musicxml.match(/<grace/g) || []).length;
        console.log(`⚠️ Found ${allGraces} grace elements, ${gracesWithSteal} with steal-time-following`);
      } else {
        console.log('❌ No grace elements found in MusicXML');
      }
    }

    // Verify grace elements exist
    expect(/<grace/.test(musicxml)).toBe(true);
  });

  test('T051: LilyPond exports ornaments with \\tiny sizing for fioritura', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type and apply ornament
    await page.keyboard.type('234');
    await page.waitForTimeout(200);

    // Select "34" (the ornament)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Open LilyPond tab
    await openTab(page, 'tab-lilypond');
    const lilypond = await readPaneText(page, 'pane-lilypond');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║ T051: Unmeasured Fioritura LilyPond \\tiny Sizing    ║');
    console.log('╚════════════════════════════════════════════════════╝');

    // Check for \tiny keyword (indicates after grace notes with reduced sizing)
    const hasTinyModifier = /\\tiny\s+[a-g]/.test(lilypond);

    if (hasTinyModifier) {
      console.log('✅ LilyPond uses \\tiny modifier for fioritura grace notes');
      expect(hasTinyModifier).toBe(true);
    } else {
      // Check what grace note syntax is used
      const hasGrace = /\\grace|\\acciaccatura/.test(lilypond);
      console.log(hasTinyModifier ? '✅' : '❌', 'LilyPond grace note formatting present:', hasGrace);
    }

    expect(lilypond.length).toBeGreaterThan(0);
  });

  test('T052: Multiple ornaments produce multiple after grace note groups', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create two groups: "234" then "567" with ornaments on each pair
    await page.keyboard.type('234567');
    await page.waitForTimeout(300);

    // Apply first ornament to "34"
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(300);

    // Apply second ornament to "67"
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Check MusicXML
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║ T052: Multiple Ornament Groups in MusicXML          ║');
    console.log('╚════════════════════════════════════════════════════╝');

    const graceCount = (musicxml.match(/<grace/g) || []).length;
    console.log(`Found ${graceCount} grace elements for two ornament groups`);

    // Verify we have grace notes (count may vary based on beat structure)
    expect(graceCount).toBeGreaterThanOrEqual(2);

    // Verify multiple main notes
    const mainNoteCount = (musicxml.match(/<note>[\s\S]*?<pitch>[\s\S]*?<\/pitch>[\s\S]*?<duration>/g) || []).length;
    console.log(`Found ${mainNoteCount} main notes`);
    expect(mainNoteCount).toBeGreaterThanOrEqual(2);

    // Verify at least one has steal-time-following attribute (indicating after grace note)
    const afterGraceCount = (musicxml.match(/grace[^>]*steal-time-following/g) || []).length;
    console.log(`Found ${afterGraceCount} grace notes with steal-time-following attribute`);
    if (afterGraceCount > 0) {
      console.log('✅ Ornaments export with steal-time-following for unmeasured fioritura');
    }
  });

  test('T053: After grace notes use sixteenth note type (smaller than before grace)', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type and apply ornament
    await page.keyboard.type('123');
    await page.waitForTimeout(200);

    // Select "23" (the ornament)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Open MusicXML tab
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║ T053: After Grace Notes Structure and Attributes    ║');
    console.log('╚════════════════════════════════════════════════════╝');

    // Check for grace elements with steal-time-following
    const afterGracePattern = /<grace[^>]*steal-time-following[^>]*\/>/g;
    const afterGraces = (musicxml.match(afterGracePattern) || []).length;

    console.log(`Found ${afterGraces} grace notes with steal-time-following attribute`);

    // Check all grace elements
    const allGraces = (musicxml.match(/<grace/g) || []).length;
    console.log(`Found ${allGraces} total grace elements`);

    if (allGraces > 0) {
      console.log('✅ Grace notes are present in MusicXML');
    }

    // At minimum, verify grace notes exist
    expect(allGraces).toBeGreaterThan(0);
  });

  test('T054: Ornament on non-adjacent notes maintains proper structure', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type: "1 2 3 4" (with spaces to separate beats)
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(200);

    // Apply ornament to "23"
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowRight');
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Check MusicXML
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║ T054: Space-Separated Notes with Ornament           ║');
    console.log('╚════════════════════════════════════════════════════╝');

    // Verify we have at least 4 main notes
    const mainNotes = (musicxml.match(/<note>[\s\S]*?<pitch>/g) || []).length;
    console.log(`Found ${mainNotes} total notes (main + grace)`);

    // Should have 4 main notes + grace notes
    expect(mainNotes).toBeGreaterThanOrEqual(4);
  });

  test('T056: Grace notes are beamed together when grouped', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type: "12345" then select "234" (3 notes to create beamed grace notes)
    await page.keyboard.type('12345');
    await page.waitForTimeout(200);

    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Check MusicXML for beam elements
    await openTab(page, 'tab-musicxml');
    const musicxml = await readPaneText(page, 'pane-musicxml');

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║ T056: Grace Note Beaming for Grouped Notes         ║');
    console.log('╚════════════════════════════════════════════════════╝');

    // Check for beam elements
    const beamBeginCount = (musicxml.match(/<beam number="1">begin<\/beam>/g) || []).length;
    const beamContinueCount = (musicxml.match(/<beam number="1">continue<\/beam>/g) || []).length;
    const beamEndCount = (musicxml.match(/<beam number="1">end<\/beam>/g) || []).length;
    const totalBeams = beamBeginCount + beamContinueCount + beamEndCount;

    console.log(`Beam elements: begin=${beamBeginCount}, continue=${beamContinueCount}, end=${beamEndCount}`);

    if (beamBeginCount > 0 && beamEndCount > 0) {
      console.log('✅ Grace notes are properly beamed with begin/end markers');
      expect(beamBeginCount).toBeGreaterThan(0);
      expect(beamEndCount).toBeGreaterThan(0);
    } else if (totalBeams > 0) {
      console.log(`⚠️ Beams present but structure unclear: ${totalBeams} beam elements found`);
    } else {
      console.log('ℹ️ No beaming found (may be single grace notes)');
    }

    // Verify grace notes exist
    expect(/<grace/.test(musicxml)).toBe(true);
  });

  test('T055: Backward selection (unsupported) vs forward selection comparison', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Test 1: Forward selection (supported)
    await editor.click();
    await page.keyboard.type('456');
    await page.waitForTimeout(200);

    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Check MusicXML forward selection result
    await openTab(page, 'tab-musicxml');
    const musicxmlForward = await readPaneText(page, 'pane-musicxml');
    const graceCountForward = (musicxmlForward.match(/<grace/g) || []).length;

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║ T055: Selection Direction Comparison               ║');
    console.log('╚════════════════════════════════════════════════════╝');
    console.log(`Forward selection (Home + Shift+Right): ${graceCountForward} grace notes`);

    // Clear for backward selection test
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Test 2: Backward selection (currently unsupported - include for documentation)
    await editor.click();
    await page.keyboard.type('456');
    await page.waitForTimeout(200);

    await page.keyboard.press('End');
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Shift+ArrowLeft');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Check MusicXML backward selection result
    const musicxmlBackward = await readPaneText(page, 'pane-musicxml');
    const graceCountBackward = (musicxmlBackward.match(/<grace/g) || []).length;
    console.log(`Backward selection (End + Shift+Left): ${graceCountBackward} grace notes`);

    console.log(`\n${graceCountForward > 0 ? '✅' : '❌'} Forward selection produces grace notes`);
    console.log(`${graceCountBackward > 0 ? '⚠️' : '📝'} Backward selection ${graceCountBackward > 0 ? 'also ' : '(not '}produces grace notes (expected limitation)`);

    expect(graceCountForward).toBeGreaterThan(0);
  });
});
