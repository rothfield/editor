import { test, expect } from '@playwright/test';

test('diagnostic: initializeSelection with cell indices 1 and 2', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();

    console.log('\n=== BEFORE initializeSelection ===');
    let selection = app.editor.getSelection();
    console.log(`Selection: ${JSON.stringify(selection)}`);

    // Get navigable stops to understand the mapping
    const stops = app.editor.getNavigableStops();
    console.log('Stops:');
    stops.forEach(s => {
      console.log(`  [${s.stopIndex}] → cellIndex=${s.cellIndex}`);
    });

    // Call initializeSelection with cells 1 and 2
    console.log('\n=== CALLING initializeSelection(1, 2) ===');
    app.editor.initializeSelection(1, 2);

    selection = app.editor.getSelection();
    const selectedText = app.editor.getSelectedText();

    console.log('\n=== AFTER initializeSelection(1, 2) ===');
    console.log(`Selection: ${JSON.stringify(selection)}`);
    console.log(`Selected text: "${selectedText}"`);

    return {
      selection,
      selectedText
    };
  });

  console.log('\n=== RESULT ===');
  console.log(`Selection: ${JSON.stringify(result.selection)}`);
  console.log(`Selected text: "${result.selectedText}"`);
  console.log(`Expected: start=1, end=2, text="56"`);

  expect(result.selection.start).toBe(1);
  expect(result.selection.end).toBe(2);
  expect(result.selectedText).toBe('56');
});
