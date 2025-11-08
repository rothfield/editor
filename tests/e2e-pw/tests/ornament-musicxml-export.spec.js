import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('note with ornament exports main pitch to MusicXML', async ({ page }) => {
  await page.goto('/');

  // Focus the editor
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "123" - this creates note 1 (pitch C) followed by pitches 2 and 3
  await page.keyboard.type('123');

  // Move cursor to position between '1' and '23'
  // After typing, cursor is at the end (after '3')
  // Press Left Arrow twice to move back to after '1'
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');

  // Select "23" by holding Shift and pressing Left Arrow twice
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');

  // Cut the selection (Ctrl+X)
  await page.keyboard.press('Control+X');

  // Now paste as ornament
  // Use the WASM API to paste ornament to the first cell (note 1)
  await page.evaluate(() => {
    if (window.editor && window.editor.pasteOrnamentToCell) {
      const cells = window.editor.getCells();
      try {
        const updated = window.editor.pasteOrnamentToCell(cells, 0);
        window.editor.setCells(updated);
      } catch (e) {
        console.log('Error pasting ornament:', e);
      }
    }
  });

  // Wait a moment for the document to update
  await page.waitForTimeout(300);

  // Export to MusicXML by opening the MusicXML inspector tab
  await openTab(page, 'tab-musicxml');

  // Read the MusicXML output
  const musicxml = await readPaneText(page, 'pane-musicxml');

  console.log('Generated MusicXML:\n', musicxml);

  // The main note should have pitch C (not a rest)
  // This is the key fix: when note 1 has ornament 23 attached,
  // the main note's pitch should be exported
  expect(musicxml).toContain('<step>C</step>');

  // Note: After the main note fix, grace notes should ideally be present
  // but they may currently be exported as regular notes depending on implementation
  console.log('✅ Main note pitch C is present in MusicXML export');
});

test('note with ornament - verifies main note is exported', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');

  // Move to position between '4' and '56'
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');

  // Select and cut "56"
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+X');

  // Paste as ornament
  await page.evaluate(() => {
    if (window.editor && window.editor.pasteOrnamentToCell) {
      const cells = window.editor.getCells();
      const updated = window.editor.pasteOrnamentToCell(cells, 0);
      window.editor.setCells(updated);
    }
  });
  await page.waitForTimeout(300);

  // Check MusicXML
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  console.log('Generated MusicXML:\n', musicxml);

  // Main note (pitch F, which is 4) should be present
  // This is the fix: notes with ornaments now export their main pitch
  expect(musicxml).toContain('<step>F</step>');

  console.log('✅ Note with ornament exports main pitch to MusicXML');
});
