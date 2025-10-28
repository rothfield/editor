import { test, expect } from '@playwright/test';

test('diagnostic: select with arrow keys and clear selection by clicking', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // 1. Type "hello"
  console.log('\n=== STEP 1: Type "hello" ===');
  await page.keyboard.type('hello');
  await page.waitForTimeout(300);

  const afterTyping = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return {
      document: app.editor.theDocument.lines[0].cells.map(c => c.char).join(''),
      selection: app.editor.theDocument.state.selection
    };
  });

  console.log(`Document: "${afterTyping.document}"`);
  console.log(`Selection after typing: ${JSON.stringify(afterTyping.selection)}`);

  // 2. Press Shift+Left 3 times to select "llo"
  console.log('\n=== STEP 2: Select "llo" with Shift+Left ===');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(100);

  const afterSelection = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.theDocument.state.selection;
    return {
      selection: selection,
      selectedText: selection && selection.start !== selection.end
        ? (() => {
            const line = app.editor.theDocument.lines[0];
            let text = '';
            for (let i = selection.start; i <= selection.end; i++) {
              if (line.cells[i]) {
                text += line.cells[i].char;
              }
            }
            return text;
          })()
        : 'NO SELECTION'
    };
  });

  console.log(`Selection range: ${JSON.stringify(afterSelection.selection)}`);
  console.log(`Selected text: "${afterSelection.selectedText}"`);

  // Verify we have a selection of 3 cells (start < end means range selected)
  expect(afterSelection.selection).not.toBeNull();
  expect(afterSelection.selection.start).toBeLessThan(afterSelection.selection.end);
  expect(afterSelection.selectedText).toBe('llo');

  // 3. Click on the editor to clear selection
  console.log('\n=== STEP 3: Click editor to clear selection ===');
  // Click on the first cell
  const firstCell = page.locator('[data-cell-index="0"]').first();
  await firstCell.click();
  await page.waitForTimeout(200);

  const afterClick = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const selection = app.editor.theDocument.state.selection;
    return {
      selection: selection,
      isCleared: selection.start === selection.end
    };
  });

  console.log(`Selection after click: ${JSON.stringify(afterClick.selection)}`);
  console.log(`Is cleared (start === end): ${afterClick.isCleared}`);

  // Verify selection is cleared (start === end means no selection)
  expect(afterClick.isCleared).toBe(true);
  expect(afterClick.selection.start).toBe(0);
  console.log('\n✓ PASS: Selection cleared by clicking');
});
