/**
 * E2E Test: Slur on two space cells
 *
 * Tests that selecting two space cells and applying a slur produces
 * Left overline on first space and Right overline on second space.
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Slur on two space cells', () => {
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

  test('two spaces: select all + apply slur → Left/Right overlines form a loop', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type two spaces
    await page.keyboard.type('  ');
    await page.waitForTimeout(100);

    // Select all
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(100);

    // Apply slur (Alt+S)
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(200);

    // Get the actual text content from the textarea
    const textareaContent = await page.evaluate(() => {
      const textarea = document.querySelector('#notation-editor textarea');
      return textarea?.value || '';
    });

    console.log('Textarea content length:', textareaContent.length);
    const codepoints = [...textareaContent].map(c => c.charCodeAt(0));
    console.log('Textarea codepoints:', codepoints.map(c => '0x' + c.toString(16).toUpperCase()));

    expect(textareaContent.length).toBe(2);

    // Verify correct codepoints are used:
    expect(codepoints[0]).toBe(0xE921); // Space with Left overline
    expect(codepoints[1]).toBe(0xE922); // Space with Right overline

    // Verify via displaylist that data layer has Left/Right (not Middle)
    await openTab(page, 'tab-displaylist');
    const displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('Displaylist:', displaylistText);

    // Parse displaylist to extract OL column values
    const lines = displaylistText.split('\n');
    const dataLines = lines.filter(l => /^\d+\t/.test(l));
    const overlineValues = dataLines.map(line => {
      const cols = line.split('\t');
      return cols[8]; // OL column
    });
    console.log('Overline values:', overlineValues);

    // Data layer is correct - Left/Right overlines
    expect(overlineValues[0]).toBe('Left');
    expect(overlineValues[1]).toBe('Right');

    // Visual check: Font glyphs at U+E921 (Left) and U+E922 (Right)
    // render curved arcs forming a loop shape ⌢ over the two spaces.
    // Width extension for narrow chars ensures arcs are visible.
  });
});
