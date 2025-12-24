import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

/**
 * Triple-click selection tests
 *
 * Triple-click selects the entire line. In the textarea-based editor,
 * this is handled natively by the browser, but we need to verify it
 * works correctly with PUA codepoints.
 */
test.describe('Triple-click line selection', () => {

  test('triple-click selects entire single line', async ({ editorPage: page }) => {
    // Type a line of content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(100);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const box = await textarea.boundingBox();

    // Triple-click in the middle
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3 });
    await page.waitForTimeout(100);

    // Verify entire line is selected
    const selection = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      valueLength: el.value.length,
      isFullLine: el.selectionStart === 0 && el.selectionEnd === el.value.length
    }));

    expect(selection.isFullLine).toBe(true);
  });

  test('triple-click works with complex beat patterns', async ({ editorPage: page }) => {
    // Type complex rhythmic content
    await typeInEditor(page, '1--2 3-4- 5---');
    await page.waitForTimeout(200);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const box = await textarea.boundingBox();

    // Triple-click
    await page.mouse.click(box.x + 50, box.y + box.height / 2, { clickCount: 3 });
    await page.waitForTimeout(100);

    // Verify full selection
    const selection = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      valueLength: el.value.length
    }));

    expect(selection.start).toBe(0);
    expect(selection.end).toBe(selection.valueLength);
  });

  test('triple-click on empty line selects nothing', async ({ editorPage: page }) => {
    // Don't type anything - line is empty
    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const box = await textarea.boundingBox();

    // Triple-click on empty line
    await page.mouse.click(box.x + 50, box.y + box.height / 2, { clickCount: 3 });
    await page.waitForTimeout(100);

    // Selection should be empty (both start and end at 0)
    const selection = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd
    }));

    expect(selection.start).toBe(0);
    expect(selection.end).toBe(0);
  });

  test('triple-click preserves focus', async ({ editorPage: page }) => {
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(100);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const box = await textarea.boundingBox();

    // Triple-click
    await page.mouse.click(box.x + 50, box.y + box.height / 2, { clickCount: 3 });
    await page.waitForTimeout(100);

    // Verify focus is maintained
    const hasFocus = await textarea.evaluate(el => document.activeElement === el);
    expect(hasFocus).toBe(true);
  });

  test('triple-click followed by typing replaces entire line', async ({ editorPage: page }) => {
    // Type initial content
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(100);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const box = await textarea.boundingBox();

    // Triple-click to select all
    await page.mouse.click(box.x + 50, box.y + box.height / 2, { clickCount: 3 });
    await page.waitForTimeout(100);

    // Type new content (should replace)
    await page.keyboard.type('7');
    await page.waitForTimeout(100);

    // Verify content was replaced
    const value = await textarea.evaluate(el => el.value);

    // Should only have the new content (single character "7" converted to PUA)
    expect(value.length).toBe(1);
  });
});

test.describe('Triple-click with multi-line documents', () => {

  test('triple-click selects only current line in multi-line document', async ({ editorPage: page }) => {
    // Type first line
    await typeInEditor(page, '1 2 3');
    await page.keyboard.press('Enter');
    // Type second line
    await typeInEditor(page, '4 5 6');
    await page.waitForTimeout(200);

    // Get both textareas
    const textarea0 = page.locator('[data-testid="notation-textarea-0"]');
    const textarea1 = page.locator('[data-testid="notation-textarea-1"]');

    // Get first line's bounding box
    const box0 = await textarea0.boundingBox();

    // Triple-click on first line
    await page.mouse.click(box0.x + 50, box0.y + box0.height / 2, { clickCount: 3 });
    await page.waitForTimeout(100);

    // Verify first line is fully selected
    const selection0 = await textarea0.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      valueLength: el.value.length,
      isFullLine: el.selectionStart === 0 && el.selectionEnd === el.value.length
    }));

    expect(selection0.isFullLine).toBe(true);

    // Verify second line is NOT selected
    const selection1 = await textarea1.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd
    }));

    // Second textarea should have no selection (or collapsed cursor)
    expect(selection1.end - selection1.start).toBe(0);
  });

  test('triple-click on second line selects only that line', async ({ editorPage: page }) => {
    // Type first line
    await typeInEditor(page, '1 2 3');
    await page.keyboard.press('Enter');
    // Type second line
    await typeInEditor(page, '4 5 6');
    await page.waitForTimeout(200);

    // Get second textarea
    const textarea1 = page.locator('[data-testid="notation-textarea-1"]');
    const box1 = await textarea1.boundingBox();

    // Triple-click on second line
    await page.mouse.click(box1.x + 50, box1.y + box1.height / 2, { clickCount: 3 });
    await page.waitForTimeout(100);

    // Verify second line is fully selected
    const selection1 = await textarea1.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      valueLength: el.value.length,
      isFullLine: el.selectionStart === 0 && el.selectionEnd === el.value.length
    }));

    expect(selection1.isFullLine).toBe(true);
  });
});
