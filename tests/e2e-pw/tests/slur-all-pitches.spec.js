/**
 * E2E Test: Slur markers on non-pitches must transfer to pitches in IR export
 *
 * Bug: When slur start/end falls on non-pitch characters (spaces, dashes),
 * the IR/MusicXML export loses the slur because those cells aren't exported.
 *
 * Test case: "--123--" (dashes before and after pitches)
 * - Select all, apply slur
 * - Slur markers land on the leading/trailing dashes
 * - Expected: IR export transfers slur to first/last PITCH, so MusicXML has slurs
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Slur on non-pitch transfers to pitches in IR export', () => {
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

  test('slur on "--123--" transfers to pitches in MusicXML', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "--123--" - dashes before and after pitches
    await page.keyboard.type('--123--');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(200);

    // Check displaylist to see where slur markers are
    await openTab(page, 'tab-displaylist');
    const displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('Displaylist after slur:', displaylistText);

    // Open MusicXML tab
    await openTab(page, 'tab-musicxml');
    const musicxmlText = await readPaneText(page, 'pane-musicxml');
    console.log('MusicXML output:', musicxmlText);

    // Must have slur in MusicXML - the slur should transfer from dashes to pitches
    expect(musicxmlText).toContain('<slur');
    expect(musicxmlText).toMatch(/<slur[^>]*type="start"/);
    expect(musicxmlText).toMatch(/<slur[^>]*type="stop"/);
  });

  test('slur on "- 123 -" (spaces + dashes) transfers to pitches', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "- 123 -" - space-dash before and after pitches
    await page.keyboard.type('- 123 -');
    await page.waitForTimeout(100);

    // Select all and apply slur
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(200);

    // Open MusicXML tab
    await openTab(page, 'tab-musicxml');
    const musicxmlText = await readPaneText(page, 'pane-musicxml');
    console.log('MusicXML output:', musicxmlText);

    // Must have slur in MusicXML
    expect(musicxmlText).toContain('<slur');
    expect(musicxmlText).toMatch(/<slur[^>]*type="start"/);
    expect(musicxmlText).toMatch(/<slur[^>]*type="stop"/);
  });
});
