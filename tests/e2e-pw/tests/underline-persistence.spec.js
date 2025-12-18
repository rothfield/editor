// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Test that underline state (beat grouping) is persisted in the document model.
 *
 * Bug: Textarea shows underlines but persistent model has underline: "None"
 */
test.describe('Underline Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    // Wait for the notation textarea to be visible
    await page.waitForSelector('[data-testid="notation-textarea-0"]', { state: 'visible', timeout: 10000 });
  });

  test('beat grouping underlines should be persisted in document model', async ({ page }) => {
    // Type "11" which should create a beat with two notes, both underlined
    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    await textarea.click();
    await page.keyboard.type('11');

    // Wait for WASM to process
    await page.waitForTimeout(500);

    // Click on Display List tab
    const displayListTab = page.locator('[data-testid="tab-displaylist"]');
    await displayListTab.click();

    // Get the display list text
    const displayListText = await page.locator('[data-testid="pane-displaylist"]').innerText();

    console.log('Display List content:');
    console.log(displayListText);

    // Parse the display list to check underline states
    // The cells should have underline states that are NOT "None"
    // For "11" in a single beat, both should have underlines:
    // - First "1": underline should be "Left" or "Both"
    // - Second "1": underline should be "Right" or "Both"

    // Parse the HTML table to check underline states
    // The table format is: Idx, Glyph, Codepoint, Base, Pitch, Oct, Underline, Overline
    // Underline column shows "-" for None, or "Left", "Right", "Middle", "Both"

    // Count cells with Pitch "N1" (the two "1" notes we typed)
    const cellCount = (displayListText.match(/\tN1\t/g) || []).length;

    // Count cells with underline as "-" (which means None)
    // Match the underline column: the second-to-last column before the final column (overline)
    // Pattern: ...N1 | - | Underline | Overline
    const underlineNoneCount = (displayListText.match(/\t-\t-$/gm) || []).length;

    console.log(`Found ${cellCount} N1 cells, ${underlineNoneCount} with underline "-"`);
    console.log('Expected: both cells should have underlines (Left/Right), not "-"');

    // If we have 2 cells (for "11"), at least one should have underlines
    // Actually, both should have underlines since they're in the same beat
    expect(cellCount).toBe(2);

    // FAILING ASSERTION: Currently all underlines are "None" but should not be
    // For a beat with 2 notes, both should have underlines (Left/Right or Middle)
    expect(underlineNoneCount).toBeLessThan(cellCount);
  });

  test('single note should not have underline', async ({ page }) => {
    // Type "1" - single note, no beat grouping needed
    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Focus the textarea using a more reliable method
    await textarea.focus();
    await page.waitForTimeout(200);
    await page.keyboard.press('1');

    // Wait for WASM to process
    await page.waitForTimeout(500);

    // Click on Display List tab
    const displayListTab = page.locator('[data-testid="tab-displaylist"]');
    await displayListTab.click();

    // Wait for content to load
    await page.waitForTimeout(200);

    // Get Display List
    const displayListText = await page.locator('[data-testid="pane-displaylist"]').innerText();

    console.log('Single note display list:', displayListText);

    // Single note should have exactly one pitch cell with underline "-" (None)
    const pitchCount = (displayListText.match(/\tN1\t/g) || []).length;
    expect(pitchCount).toBe(1);
    // And it should have underline "-" (None) - the last two columns should both be "-"
    expect(displayListText).toMatch(/N1.*\t-\t-/);
  });

  test('notes in separate beats should not have underlines', async ({ page }) => {
    // Type "1 2" - two separate beats, no underlines needed
    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    await textarea.click();
    // Wait for focus
    await page.waitForTimeout(100);
    await page.keyboard.type('1 2');

    // Wait for WASM to process
    await page.waitForTimeout(500);

    // Click on Display List tab
    const displayListTab = page.locator('[data-testid="tab-displaylist"]');
    await displayListTab.click();

    // Wait for content to load
    await page.waitForTimeout(200);

    // Get Display List
    const displayListText = await page.locator('[data-testid="pane-displaylist"]').innerText();

    console.log('Separate beats display list:', displayListText);

    // Both notes should have underline "-" (None) since they're in separate beats
    // Count cells with Pitch N1 or N2
    const pitchCellCount = (displayListText.match(/\tN[12]\t/g) || []).length;
    // Count cells with underline as "-" (None) - match end of line
    const underlineNoneCount = (displayListText.match(/\t-\t-\s*$/gm) || []).length;

    console.log(`Found ${pitchCellCount} pitch cells, ${underlineNoneCount} with underline "-"`);

    expect(pitchCellCount).toBe(2);
    // Both separate beats should have no underlines (both should be "-")
    expect(underlineNoneCount).toBeGreaterThanOrEqual(2);
  });
});
