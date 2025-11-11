import { test, expect } from '@playwright/test';

test.describe('Undo/Redo System', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible' });
    });

    test('undo single character insertion', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type a single character
        await editor.click();
        await page.keyboard.type('1');

        // Wait for the character to appear
        await expect(editor).toContainText('1');

        // Trigger undo (Ctrl+Z)
        await page.keyboard.press('Control+z');

        // Verify character was removed
        await expect(editor).not.toContainText('1');
    });

    test('redo after undo', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type a character
        await editor.click();
        await page.keyboard.type('2');
        await expect(editor).toContainText('2');

        // Undo
        await page.keyboard.press('Control+z');
        await expect(editor).not.toContainText('2');

        // Redo (Ctrl+Shift+Z or Ctrl+Y)
        await page.keyboard.press('Control+Shift+z');

        // Verify character was restored
        await expect(editor).toContainText('2');
    });

    test('undo batches word insertion', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type a word (should be batched together)
        await editor.click();
        await page.keyboard.type('123');

        // Wait for all characters
        await expect(editor).toContainText('123');

        // Single undo should remove entire word
        await page.keyboard.press('Control+z');

        // Verify entire word was removed (batched)
        await expect(editor).not.toContainText('123');
        await expect(editor).not.toContainText('1');
    });

    test('undo breaks batch on whitespace', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type two words separated by space
        await editor.click();
        await page.keyboard.type('12 34');

        await expect(editor).toContainText('12 34');

        // First undo should remove second word + space
        await page.keyboard.press('Control+z');
        await expect(editor).not.toContainText('34');

        // Second undo should remove first word
        await page.keyboard.press('Control+z');
        await expect(editor).not.toContainText('12');
    });

    test('undo delete operation', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type characters
        await editor.click();
        await page.keyboard.type('567');
        await expect(editor).toContainText('567');

        // Delete a character (backspace)
        await page.keyboard.press('Backspace');
        await expect(editor).not.toContainText('567');
        await expect(editor).toContainText('56');

        // Undo the delete
        await page.keyboard.press('Control+z');

        // Verify character was restored
        await expect(editor).toContainText('567');
    });

    test('undo multiple operations in sequence', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Perform multiple operations
        await editor.click();
        await page.keyboard.type('1'); // Operation 1
        await page.keyboard.type(' '); // Operation 2 (breaks batch)
        await page.keyboard.type('2'); // Operation 3

        await expect(editor).toContainText('1 2');

        // Undo operation 3
        await page.keyboard.press('Control+z');
        await expect(editor).toContainText('1 ');
        await expect(editor).not.toContainText('2');

        // Undo operation 2
        await page.keyboard.press('Control+z');
        await expect(editor).toContainText('1');
        await expect(editor).not.toContainText(' ');

        // Undo operation 1
        await page.keyboard.press('Control+z');
        await expect(editor).not.toContainText('1');
    });

    test('redo multiple operations', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type and undo
        await editor.click();
        await page.keyboard.type('3 4');
        await page.keyboard.press('Control+z'); // Undo '4'
        await page.keyboard.press('Control+z'); // Undo ' '
        await page.keyboard.press('Control+z'); // Undo '3'

        // Redo all operations
        await page.keyboard.press('Control+Shift+z'); // Redo '3'
        await expect(editor).toContainText('3');

        await page.keyboard.press('Control+Shift+z'); // Redo ' '
        await expect(editor).toContainText('3 ');

        await page.keyboard.press('Control+Shift+z'); // Redo '4'
        await expect(editor).toContainText('3 4');
    });

    test('new edit after undo clears redo history', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type, undo, then type new character
        await editor.click();
        await page.keyboard.type('5');
        await expect(editor).toContainText('5');

        await page.keyboard.press('Control+z');
        await expect(editor).not.toContainText('5');

        // Type new character (should clear redo history)
        await page.keyboard.type('6');
        await expect(editor).toContainText('6');

        // Redo should not restore '5'
        await page.keyboard.press('Control+Shift+z');

        // Should still only have '6'
        await expect(editor).toContainText('6');
        await expect(editor).not.toContainText('5');
    });

    test('LilyPond output reflects undo/redo', async ({ page }) => {
        const editor = page.getByTestId('editor-root');

        // Type sequence
        await editor.click();
        await page.keyboard.type('1 2 3');

        // Open LilyPond tab
        const lilypondTab = page.getByTestId('tab-lilypond');
        await lilypondTab.click();

        const lilypondPane = page.getByTestId('pane-lilypond');
        await expect(lilypondPane).toBeVisible();

        // Wait for content to appear
        await expect(lilypondPane).not.toBeEmpty();
        const initialContent = await lilypondPane.innerText();

        // Undo last number
        await page.keyboard.press('Control+z');

        // LilyPond should update
        const afterUndoContent = await lilypondPane.innerText();
        expect(afterUndoContent).not.toBe(initialContent);

        // Redo
        await page.keyboard.press('Control+Shift+z');

        // LilyPond should restore
        const afterRedoContent = await lilypondPane.innerText();
        expect(afterRedoContent).toBe(initialContent);
    });
});
