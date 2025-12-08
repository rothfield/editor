/**
 * E2E Test: Slur Should Not Extend to New Notes
 *
 * Bug: When applying a slur to selected notes, then typing a new note,
 * the new note incorrectly gets included in the slur.
 *
 * Steps to reproduce:
 * 1. Type "12"
 * 2. Select both characters with Shift+Left Arrow twice
 * 3. Press Alt+S to apply slur
 * 4. Type "3"
 * 5. Expected: "3" should NOT be under the slur
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Slur Should Not Extend to New Notes', () => {
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

  test('typing after slur should NOT include new note in slur', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Step 1: Type "12"
    await page.keyboard.type('12');
    await page.waitForTimeout(200);

    // Step 2: Select both characters with Shift+Left Arrow twice
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(100);

    // Step 3: Apply slur with Alt+S
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Step 4: Type "3" (cursor should be at end after slur is applied)
    await page.keyboard.press('End'); // Ensure cursor is at end
    await page.keyboard.type('3');
    await page.waitForTimeout(300);

    // Step 5: Verify slur indicators in persistent model
    await openTab(page, 'tab-docmodel');
    const persistentModel = await readPaneText(page, 'pane-docmodel');

    console.log('Persistent Model after typing "3":');
    console.log(persistentModel);

    // Parse the cells to check slur indicators
    // Expected:
    //   - Cell 0 ("1"): slur_start
    //   - Cell 1 ("2"): slur_end
    //   - Cell 2 ("3"): none (NOT part of slur)

    // Check that "3" does NOT have slur_end
    // The slur_end should be on "2", not on "3"

    // Find where slur_end appears - it should be on cell with pitch_code N2, not N3
    const lines = persistentModel.split('\n');

    // Find all cells and their slur indicators
    let currentPitchCode = '';
    let slurEndPitchCode = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('pitch_code:')) {
        currentPitchCode = line.split(':')[1].trim().replace(/"/g, '');
      }
      if (line.includes('name: "slur_end"')) {
        slurEndPitchCode = currentPitchCode;
      }
    }

    console.log(`slur_end is on pitch_code: ${slurEndPitchCode}`);

    // The slur_end should be on "2" (N2), NOT on "3" (N3)
    expect(slurEndPitchCode).toBe('N2');
    expect(slurEndPitchCode).not.toBe('N3');

    // Also verify annotation_layer.slurs has correct end column
    // slur covers cols 0,1 so end is col 2 (exclusive)
    expect(persistentModel).toMatch(/end:\s*\n\s*line:\s*0\s*\n\s*col:\s*2/);
  });

  test('slur annotation end column should not change after typing new note', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type "12", select, apply slur
    await page.keyboard.type('12');
    await page.waitForTimeout(200);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Alt+S');
    await page.waitForTimeout(300);

    // Check slur end column BEFORE typing "3"
    await openTab(page, 'tab-docmodel');
    let model = await readPaneText(page, 'pane-docmodel');

    // Extract slur end column from annotation_layer
    const endColBeforeMatch = model.match(/slurs:[\s\S]*?end:\s*\n\s*line:\s*\d+\s*\n\s*col:\s*(\d+)/);
    const endColBefore = endColBeforeMatch ? parseInt(endColBeforeMatch[1]) : -1;
    console.log(`Slur end col BEFORE typing "3": ${endColBefore}`);

    // Type "3"
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type('3');
    await page.waitForTimeout(300);

    // Check slur end column AFTER typing "3"
    await openTab(page, 'tab-docmodel');
    model = await readPaneText(page, 'pane-docmodel');

    const endColAfterMatch = model.match(/slurs:[\s\S]*?end:\s*\n\s*line:\s*\d+\s*\n\s*col:\s*(\d+)/);
    const endColAfter = endColAfterMatch ? parseInt(endColAfterMatch[1]) : -1;
    console.log(`Slur end col AFTER typing "3": ${endColAfter}`);

    // The slur end column should NOT have changed
    // Bug: end col changes from 1 to 2 (or similar) when "3" is typed
    expect(endColAfter).toBe(endColBefore);
  });
});
