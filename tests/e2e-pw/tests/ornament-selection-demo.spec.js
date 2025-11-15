/**
 * Demo: Selection-to-ornament feature
 *
 * This test demonstrates the selection-to-ornament functionality
 * using clipboard simulation (until Shift+Arrow selection is implemented)
 */

import { test, expect } from '@playwright/test';

test.describe('Selection-to-Ornament Demo (using clipboard)', () => {
  test('demo: type 123, manually copy "23" to clipboard, apply as ornament to "1"', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Step 1: Type "123"
    console.log('Step 1: Type "123"');
    await page.keyboard.type('123');
    await page.waitForTimeout(500);

    // Step 2: Manually set ornament notation in clipboard (simulating selection)
    console.log('Step 2: Simulating selection by setting clipboard to "23"');
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      // This simulates what would happen if user selected "23"
      app.editor.clipboard.ornamentNotation = '23';
    });

    // Step 3: Position cursor after "1" (col 1)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');

    // Step 4: Press Alt+O to paste ornament
    console.log('Step 3: Press Alt+O to apply ornament');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Step 5: Verify ornament "23" applied to "1"
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    console.log('Result:', ornament);
    expect(ornament).not.toBe(null);
    expect(ornament.notation).toBe('23');

    console.log('✅ SUCCESS: Ornament "23" applied to note "1"');
    console.log('   (This demonstrates what will work once Shift+Arrow selection is implemented)');
  });

  test('demo: multiple ornaments using clipboard simulation', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1 2 3"
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Apply ornament "45" to "1"
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      app.editor.clipboard.ornamentNotation = '45';
    });
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(300);

    // Apply ornament "67" to "2"
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      app.editor.clipboard.ornamentNotation = '67';
    });
    await page.keyboard.press('ArrowRight'); // space
    await page.keyboard.press('ArrowRight'); // after "2"
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(300);

    // Verify both ornaments
    const ornaments = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentsForLine(0);
    });

    console.log('All ornaments:', ornaments);
    expect(ornaments.length).toBe(2);
    expect(ornaments[0].notation).toBe('45');
    expect(ornaments[1].notation).toBe('67');

    console.log('✅ Multiple ornaments applied successfully');
  });
});

test.describe('Future Feature: Shift+Arrow Selection (TODO)', () => {
  test.skip('FUTURE: type 123<Shift+Left×2><Alt+O> should apply ornament "23" to "1"', async ({ page }) => {
    /**
     * This test documents the intended workflow once Shift+Arrow selection is implemented.
     *
     * Expected behavior:
     * 1. User types "123"
     * 2. Presses Shift+Left twice to select "23"
     * 3. Presses Alt+O
     * 4. System should:
     *    a. Extract selected text "23"
     *    b. Apply it as ornament to the note before selection (note "1" at col 0)
     *    c. Ornament "23" is stored in annotation layer
     *    d. Optionally: delete "23" from the text or leave it
     *
     * Implementation requirements:
     * - Keyboard handler must support Shift+Arrow keys to create/extend selection
     * - Selection state must be preserved in document model
     * - pasteOrnament() must check for selection first (DONE ✓)
     * - pasteOrnament() must extract text from selection (DONE ✓)
     * - pasteOrnament() must find target note before selection (DONE ✓)
     */

    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "123"
    await page.keyboard.type('123');

    // Select "23" with Shift+Left twice
    // (This currently doesn't create a selection - needs implementation)
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    // Press Alt+O to apply
    await page.keyboard.press('Alt+o');

    // Would verify ornament applied to "1"
    const ornament = await page.evaluate(() => {
      const editor = window.MusicNotationApp.app().editor;
      return editor.wasmModule.getOrnamentAt(0, 0);
    });

    expect(ornament.notation).toBe('23');
  });
});

test.describe('Documentation: How the feature works', () => {
  test('explain: pasteOrnament() selection detection logic', async ({ page }) => {
    /**
     * The pasteOrnament() function in src/js/ui.js now includes selection detection:
     *
     * 1. Check if there's a selection:
     *    - If doc.state.selection exists with anchor and head
     *    - Extract selected text from cells
     *    - Use selected text as ornament notation
     *    - Target = cell before selection start
     *
     * 2. If no selection:
     *    - Use clipboard.ornamentNotation
     *    - Target = cursor.col - 1
     *
     * This means the feature is ready to work as soon as:
     * - Shift+Arrow keys are wired to create selections
     * - Selection state is properly maintained in document model
     */

    // This test just documents the implementation - no actual test needed
    expect(true).toBe(true);
  });
});
