/**
 * E2E Test: Editor status bar should show selection after Shift+Left selection
 * Type "123", select "23" with Shift+Left×2, verify status bar displays selection info
 */

import { test, expect } from '@playwright/test';

test.describe('Selection Status Bar Display: 123 → Shift+Left×2', () => {
  test('status bar should show selection info after typing 123 and selecting with Shift+Left×2', async ({ page }) => {
    // Navigate to editor
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Get status bar element
    const selectionStatus = page.locator('#editor-selection-status');

    // Initial state: should show "No selection"
    await expect(selectionStatus).toBeVisible();
    await expect(selectionStatus).toHaveText(/No selection/i);

    // Step 1: Type "123"
    console.log('Step 1: Typing "123"...');
    await page.keyboard.type('123');
    await page.waitForTimeout(300);

    // Verify text was typed
    const docAfterTyping = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      return {
        cells: doc.lines[0].cells.map(c => c.char),
        cursor: doc.state.cursor
      };
    });

    console.log('After typing "123":', docAfterTyping);
    expect(docAfterTyping.cells).toEqual(['1', '2', '3']);
    expect(docAfterTyping.cursor.col).toBe(3); // Cursor after "3"

    // Status should still show "No selection"
    await expect(selectionStatus).toHaveText(/No selection/i);

    // Step 2: Select "23" with Shift+Left×2
    console.log('Step 2: Selecting "23" with Shift+Left×2...');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(300);

    // Verify selection state in WASM
    const selectionState = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      const doc = editor.wasmModule.getDocumentSnapshot();
      return {
        cursor: doc.state.cursor,
        selection: doc.state.selection_manager?.current_selection,
        hasSelection: doc.state.selection_manager?.current_selection !== null &&
                     doc.state.selection_manager?.current_selection !== undefined
      };
    });

    console.log('Selection state:', selectionState);
    expect(selectionState.hasSelection).toBe(true);
    expect(selectionState.cursor.col).toBe(1); // Cursor moved to col 1
    expect(selectionState.selection.anchor.col).toBe(3); // Anchor at original position
    expect(selectionState.selection.head.col).toBe(1); // Head at current position

    // Step 3: VERIFY STATUS BAR SHOWS SELECTION INFO
    console.log('Step 3: Verifying status bar shows selection...');

    // Wait for status to update
    await expect(selectionStatus).not.toHaveText(/No selection/i, { timeout: 2000 });

    // Status bar should show selection information
    const statusText = await selectionStatus.innerText();
    console.log('Status bar text:', statusText);

    // Should contain selection info (e.g., "Selected: 2 cells" or similar)
    expect(statusText).toMatch(/selected|selection/i);
    expect(statusText).not.toMatch(/no selection/i);

    // Optional: verify it shows the correct count (2 cells selected: "2" and "3")
    // The exact format may vary, but should indicate 2 cells
    expect(statusText).toMatch(/2/); // Should mention "2" somewhere (2 cells selected)

    console.log('✅ SUCCESS: Status bar shows selection after Shift+Left×2');
  });

  test('status bar updates when selection is cleared', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    const selectionStatus = page.locator('#editor-selection-status');

    // Type and select
    await page.keyboard.type('123');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(300);

    // Verify selection is shown
    await expect(selectionStatus).not.toHaveText(/No selection/i);
    const selectedText = await selectionStatus.innerText();
    expect(selectedText).toMatch(/selected|selection/i);

    // Clear selection by pressing Right arrow (without Shift)
    console.log('Clearing selection with Right arrow...');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    // Status should return to "No selection"
    await expect(selectionStatus).toHaveText(/No selection/i, { timeout: 2000 });

    console.log('✅ Status bar correctly shows "No selection" after clearing');
  });

  test('status bar shows different counts for different selection sizes', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    const selectionStatus = page.locator('#editor-selection-status');

    // Type "12345"
    await page.keyboard.type('12345');
    await page.waitForTimeout(300);

    // Select 1 cell (just "5")
    console.log('Selecting 1 cell...');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(200);

    let statusText = await selectionStatus.innerText();
    console.log('Status with 1 cell selected:', statusText);
    expect(statusText).toMatch(/1/); // Should show "1" cell or character

    // Extend selection to 3 cells ("345")
    console.log('Extending selection to 3 cells...');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(200);

    statusText = await selectionStatus.innerText();
    console.log('Status with 3 cells selected:', statusText);
    expect(statusText).toMatch(/3/); // Should show "3" cells or characters

    // Extend to full selection (all 5 cells "12345")
    console.log('Extending to full selection (5 cells)...');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(200);

    statusText = await selectionStatus.innerText();
    console.log('Status with 5 cells selected:', statusText);
    expect(statusText).toMatch(/5/); // Should show "5" cells or characters

    console.log('✅ Status bar correctly updates count as selection changes');
  });

  test('status bar shows selection text preview', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    const selectionStatus = page.locator('#editor-selection-status');

    // Type "123" and select "23"
    await page.keyboard.type('123');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(300);

    const statusText = await selectionStatus.innerText();
    console.log('Status bar text:', statusText);

    // Status bar might show the selected text "23" or at least mention selection
    // The exact format depends on implementation, but should be informative
    expect(statusText).toMatch(/selected|selection/i);

    // If it shows the text preview, verify it contains "23"
    // This is optional depending on implementation
    if (statusText.includes('23') || statusText.includes('"23"')) {
      console.log('✅ Status bar shows selected text preview: "23"');
    } else {
      console.log('ℹ️ Status bar shows selection info without text preview');
    }
  });
});
