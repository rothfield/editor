/**
 * E2E Test: Grace notes don't participate in beat groups
 *
 * Grace notes (superscripts) should not begin or end beat group underlines.
 * When "12" has "2" converted to ornament, result should have no underlines
 * because "1" alone doesn't form a beat group.
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Grace notes and beat groups', () => {
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

  test('making second note ornament removes beat group underlines', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12" - this creates a beat with 2 subdivisions, both underlined
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Check displaylist - should have underlines (Left, Right)
    await openTab(page, 'tab-displaylist');
    let displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('Before ornament:', displaylistText);

    // Parse UL column - should have Left and Right underlines
    let lines = displaylistText.split('\n');
    let dataLines = lines.filter(l => /^\d+\t/.test(l));
    let ulValues = dataLines.map(line => {
      const cols = line.split('\t');
      return cols[7]; // UL column
    });
    console.log('UL values before:', ulValues);

    // Verify beat group exists initially
    expect(ulValues[0]).toBe('Left');
    expect(ulValues[1]).toBe('Right');

    // Select "2" (second character)
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(100);

    // Apply ornament (Alt+O)
    await page.keyboard.press('Alt+O');
    await page.waitForTimeout(200);

    // Check displaylist again
    displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('After ornament:', displaylistText);

    // Parse UL column again
    lines = displaylistText.split('\n');
    dataLines = lines.filter(l => /^\d+\t/.test(l));
    ulValues = dataLines.map(line => {
      const cols = line.split('\t');
      return cols[7]; // UL column
    });
    console.log('UL values after:', ulValues);

    // Grace note (2) should not participate in beat group
    // So "1" alone should have NO underline (single note = no beat group)
    expect(ulValues[0]).toBe('-'); // No underline on "1"
    // The grace note "2" also should have no underline
    expect(ulValues[1]).toBe('-'); // No underline on grace note "2"
  });

  test('grace note in middle of beat does not break underline continuity', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "123" - beat with 3 subdivisions
    await page.keyboard.type('123');
    await page.waitForTimeout(100);

    // Select "2" (middle character)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(100);

    // Apply ornament (Alt+O)
    await page.keyboard.press('Alt+O');
    await page.waitForTimeout(200);

    // Check displaylist
    await openTab(page, 'tab-displaylist');
    const displaylistText = await readPaneText(page, 'pane-displaylist');
    console.log('After middle ornament:', displaylistText);

    // Parse UL column
    const lines = displaylistText.split('\n');
    const dataLines = lines.filter(l => /^\d+\t/.test(l));
    const ulValues = dataLines.map(line => {
      const cols = line.split('\t');
      return cols[7]; // UL column
    });
    console.log('UL values:', ulValues);

    // "1" and "3" form a beat group, grace note "2" gets Middle underline for visual continuity
    // So we should have: Left on "1", Middle on "2" (grace), Right on "3"
    expect(ulValues[0]).toBe('Left');   // "1" starts beat group
    expect(ulValues[1]).toBe('Middle'); // "2" grace note - Middle underline (inside beat group)
    expect(ulValues[2]).toBe('Right');  // "3" ends beat group
  });
});
