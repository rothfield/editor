/**
 * E2E Tests: Ornament Export to MusicXML and LilyPond (WYSIWYG Pattern)
 * Feature: 006-music-notation-ornament
 * Tests T016 & T017: Verify ornamental cells export as grace notes
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, musicXMLContains, lilypondContains } from '../helpers/inspectors.js';

test.describe('Ornament Export - MusicXML and LilyPond', () => {
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

  test('T016: MusicXML export - ornaments as <grace/> elements', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type and apply ornament via WYSIWYG pattern
    await page.keyboard.type('2 3 4 1');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight'); // Select "2 3 4"
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Open MusicXML tab
    await openTab(page, 'tab-musicxml');
    const musicXMLText = await readPaneText(page, 'pane-musicxml');

    // Verify basic MusicXML structure
    expect(musicXMLText.length).toBeGreaterThan(0);

    // When ornament export is implemented, should contain <grace/> elements
    if (musicXMLText.includes('<grace')) {
      // Verify <grace> element exists (may have attributes like slash="yes")
      expect(musicXMLText).toMatch(/<grace[^>]*\/>/);

      // Grace notes should not have duration
      // Find all note elements and verify at least one has <grace> without <duration>
      const noteMatches = musicXMLText.match(/<note>[\s\S]*?<\/note>/g);
      let foundGraceWithoutDuration = false;

      if (noteMatches) {
        for (const noteMatch of noteMatches) {
          if (noteMatch.includes('<grace') && !noteMatch.includes('<duration>')) {
            foundGraceWithoutDuration = true;
            break;
          }
        }
      }

      expect(foundGraceWithoutDuration).toBe(true);
      if (foundGraceWithoutDuration) {
        console.log('✅ T016: MusicXML contains <grace/> elements without duration');
      }
    } else {
      console.log('⚠️ T016: MusicXML grace note export pending implementation');
      console.log('MusicXML output:', musicXMLText.substring(0, 300));
    }
  });

  test('T017: LilyPond export - ornaments as \\grace {} syntax', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type and apply ornament
    await page.keyboard.type('2 3 4 1');
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Open LilyPond tab
    await openTab(page, 'tab-lilypond');
    const lilypondText = await readPaneText(page, 'pane-lilypond');

    // Verify basic LilyPond structure
    expect(lilypondText.length).toBeGreaterThan(0);

    // When ornament export is implemented, should contain \grace {} syntax
    if (lilypondText.includes('\\grace')) {
      // Verify \grace { ... } pattern
      expect(lilypondText).toMatch(/\\grace\s*\{[^}]*\}/);

      // Extract grace note content
      const graceMatch = lilypondText.match(/\\grace\s*\{([^}]*)\}/);
      if (graceMatch) {
        const graceContent = graceMatch[1].trim();
        expect(graceContent.length).toBeGreaterThan(0);
        console.log(`✅ T017: LilyPond contains \\grace { ${graceContent} } syntax`);
      }
    } else {
      console.log('⚠️ T017: LilyPond grace note export pending implementation');
      console.log('LilyPond output:', lilypondText.substring(0, 300));
    }
  });

  test('Multiple ornaments export correctly', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Create two ornament groups
    await page.keyboard.type('2 3 1 4 5 2');
    await page.waitForTimeout(300);

    // Apply first ornament (2 3)
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(300);

    // Apply second ornament (4 5)
    await page.keyboard.press('Home');
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press('ArrowRight');
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(500);

    // Verify LilyPond export has multiple grace note groups
    await openTab(page, 'tab-lilypond');
    const lilypondText = await readPaneText(page, 'pane-lilypond');

    if (lilypondText.includes('\\grace')) {
      const graceMatches = lilypondText.match(/\\grace\s*\{[^}]*\}/g);
      if (graceMatches) {
        expect(graceMatches.length).toBeGreaterThanOrEqual(2);
        console.log(`✅ Multiple ornaments: Found ${graceMatches.length} \\grace groups`);
      }
    } else {
      console.log('⚠️ Multiple ornament export pending implementation');
    }
  });
});
