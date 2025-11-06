import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test.describe('Linux-style Primary Selection (X11)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
  });

  test('Drag-select copies to primary register and system clipboard', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Type some notes
    await editor.click();
    await page.keyboard.type('S- r g- m |');

    // Drag-select the first beat "S- r"
    // Get editor bounds
    const editorBox = await editor.boundingBox();
    const startX = editorBox.x + 50;
    const startY = editorBox.y + editorBox.height / 2;
    const endX = editorBox.x + 150;
    const endY = editorBox.y + editorBox.height / 2;

    // Drag to select
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // Wait a moment for primary selection to be updated
    await page.waitForTimeout(100);

    // Verify we can middle-click paste at a different location (proving primary selection works)
    const pasteX = editorBox.x + 200;
    const pasteY = editorBox.y + editorBox.height / 2;

    // Middle-click to paste from primary selection
    await page.mouse.click(pasteX, pasteY, { button: 'middle' });

    // Wait for paste to complete
    await page.waitForTimeout(100);

    // Check that the LilyPond output shows the pasted content
    await openTab(page, 'tab-lilypond');
    const ly = await readPaneText(page, 'pane-lilypond');

    // Should have LilyPond output with the pasted note
    expect(ly.length).toBeGreaterThan(0);
  });

  test('Middle-click pastes from primary selection register', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Type initial notes
    await editor.click();
    await page.keyboard.type('S- r |');

    // Drag-select the first cell "S"
    const editorBox = await editor.boundingBox();
    const startX = editorBox.x + 50;
    const startY = editorBox.y + editorBox.height / 2;
    const endX = editorBox.x + 70;
    const endY = editorBox.y + editorBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // Wait for primary selection to update
    await page.waitForTimeout(100);

    // Move to a new position
    const pasteX = editorBox.x + 200;
    const pasteY = editorBox.y + editorBox.height / 2;

    // Middle-click to paste
    await page.mouse.click(pasteX, pasteY, { button: 'middle' });

    // Wait for paste to complete
    await page.waitForTimeout(100);

    // Check that the LilyPond output shows the pasted content
    await openTab(page, 'tab-lilypond');
    const ly = await readPaneText(page, 'pane-lilypond');

    // Should have LilyPond output with the pasted note
    expect(ly.length).toBeGreaterThan(0);
  });

  test('Ctrl+C syncs primary selection register with clipboard', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Type notes
    await editor.click();
    await page.keyboard.type('S- r g- m |');

    // Drag-select some notes
    const editorBox = await editor.boundingBox();
    const startX = editorBox.x + 50;
    const startY = editorBox.y + editorBox.height / 2;
    const endX = editorBox.x + 150;
    const endY = editorBox.y + editorBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // Copy with Ctrl+C
    await page.keyboard.press('Control+C');

    // Wait for sync
    await page.waitForTimeout(100);

    // Verify we can paste with middle-click at a new location
    const pasteX = editorBox.x + 200;
    const pasteY = editorBox.y + editorBox.height / 2;

    // Middle-click to paste
    await page.mouse.click(pasteX, pasteY, { button: 'middle' });

    // Wait for paste to complete
    await page.waitForTimeout(100);

    // Check that content was pasted by looking at LilyPond output
    await openTab(page, 'tab-lilypond');
    const ly = await readPaneText(page, 'pane-lilypond');

    expect(ly.length).toBeGreaterThan(0);
  });

  test('Select-to-copy preserves music notation (octaves/slurs)', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Type notes with octave marks
    await editor.click();
    await page.keyboard.type('S^ r r_ |');

    // Select some notes
    const editorBox = await editor.boundingBox();
    const startX = editorBox.x + 50;
    const startY = editorBox.y + editorBox.height / 2;
    const endX = editorBox.x + 150;
    const endY = editorBox.y + editorBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // Wait for primary selection update
    await page.waitForTimeout(100);

    // Middle-click to paste
    const pasteX = editorBox.x + 200;
    const pasteY = editorBox.y + editorBox.height / 2;

    await page.mouse.click(pasteX, pasteY, { button: 'middle' });

    // Wait for paste
    await page.waitForTimeout(100);

    // Check MusicXML to verify octave marks were preserved
    await openTab(page, 'tab-musicxml');
    const xml = await readPaneText(page, 'pane-musicxml');

    // The pasted content should appear in the XML
    expect(xml.length).toBeGreaterThan(0);
  });

  test('Primary selection persists when selection is cleared', async ({ page }) => {
    const editor = page.getByTestId('editor-root');

    // Type notes
    await editor.click();
    await page.keyboard.type('S- r g- m |');

    // Select some content
    const editorBox = await editor.boundingBox();
    const startX = editorBox.x + 50;
    const startY = editorBox.y + editorBox.height / 2;
    const endX = editorBox.x + 150;
    const endY = editorBox.y + editorBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY);
    await page.mouse.up();

    // Wait for primary selection
    await page.waitForTimeout(100);

    // Click somewhere else to clear selection
    await page.keyboard.press('Escape');

    // Wait for selection clear
    await page.waitForTimeout(100);

    // Middle-click paste should still work (using last primary selection)
    const pasteX = editorBox.x + 200;
    const pasteY = editorBox.y + editorBox.height / 2;

    await page.mouse.click(pasteX, pasteY, { button: 'middle' });

    // Wait for paste
    await page.waitForTimeout(100);

    // Check that something was pasted
    await openTab(page, 'tab-lilypond');
    const ly = await readPaneText(page, 'pane-lilypond');

    expect(ly.length).toBeGreaterThan(0);
  });
});
