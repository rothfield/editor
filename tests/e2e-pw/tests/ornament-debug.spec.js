import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Ornament Debug', () => {
  test('check if ornament indicators are applied to cells', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type: "Hello" with ornament span
    await page.keyboard.type('H');
    await page.keyboard.type('e');

    // Toggle ornament edit mode ON to add ornament indicators
    await page.keyboard.press('Alt+Shift+O');
    await page.keyboard.type('['); // Start ornament

    await page.keyboard.type('l');
    await page.keyboard.type('l');

    await page.keyboard.type(']'); // End ornament
    await page.keyboard.type('o');

    // Wait for rendering
    await page.waitForTimeout(300);

    // Check Document Model to see if ornament_indicator fields exist
    await openTab(page, 'tab-docmodel');
    const docModel = await readPaneText(page, 'pane-docmodel');

    console.log('Document Model:', docModel);

    // Check for ornament indicators in the model
    expect(docModel).toContain('ornament_indicator');

    // Check if Start and End indicators are present
    const hasStart = docModel.includes('OrnamentAfterStart') ||
                     docModel.includes('OrnamentBeforeStart') ||
                     docModel.includes('OrnamentOnTopStart');
    const hasEnd = docModel.includes('OrnamentAfterEnd') ||
                   docModel.includes('OrnamentBeforeEnd') ||
                   docModel.includes('OrnamentOnTopEnd');

    console.log(`Has Start indicator: ${hasStart}`);
    console.log(`Has End indicator: ${hasEnd}`);

    expect(hasStart).toBe(true);
    expect(hasEnd).toBe(true);
  });

  test('check ornament_edit_mode in document', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type some content
    await page.keyboard.type('Hello');

    // Check mode display (should show OFF by default)
    const modeDisplay = page.locator('#ornament-edit-mode-display');
    await expect(modeDisplay).toContainText('Edit Ornament Mode: OFF');

    // Check document model
    await openTab(page, 'tab-docmodel');
    let docModel = await readPaneText(page, 'pane-docmodel');

    console.log('Document Model (OFF):', docModel.substring(0, 500));

    // Toggle to ON
    await page.keyboard.press('Alt+Shift+O');
    await page.waitForTimeout(300);

    await expect(modeDisplay).toContainText('Edit Ornament Mode: ON');

    // Check document model again
    await openTab(page, 'tab-docmodel');
    docModel = await readPaneText(page, 'pane-docmodel');

    console.log('Document Model (ON):', docModel.substring(0, 500));

    // Check if ornament_edit_mode field exists in document
    const hasMode = docModel.includes('ornament_edit_mode');
    console.log(`Document has ornament_edit_mode field: ${hasMode}`);

    if (hasMode) {
      console.log('ornament_edit_mode value:', docModel.match(/ornament_edit_mode["\s:]+(\w+)/)?.[1]);
    }
  });
});
