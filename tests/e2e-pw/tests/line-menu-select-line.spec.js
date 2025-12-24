import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

/**
 * Line menu > Select Line tests
 *
 * BUG: The Select Line menu action sets the selection correctly but loses
 * focus on the textarea, so subsequent typing doesn't work.
 */
test.describe('Line menu - Select Line', () => {

  test('Select Line selects entire textarea content', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(200);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Open Line menu and click Select Line
    await page.getByRole('button', { name: 'Line' }).click();
    await page.waitForTimeout(100);
    await page.locator('#menu-select-all').click();
    await page.waitForTimeout(200);

    // Verify entire line is selected
    const selection = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      valueLength: el.value.length,
      isFullLine: el.selectionStart === 0 && el.selectionEnd === el.value.length
    }));

    expect(selection.isFullLine).toBe(true);
  });

  test('Select Line maintains focus so typing replaces selection', async ({ editorPage: page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(200);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const originalLength = await textarea.evaluate(el => el.value.length);

    // Open Line menu and click Select Line
    await page.getByRole('button', { name: 'Line' }).click();
    await page.waitForTimeout(100);
    await page.locator('#menu-select-all').click();
    await page.waitForTimeout(200);

    // Verify textarea still has focus
    const hasFocus = await textarea.evaluate(el => document.activeElement === el);
    expect(hasFocus).toBe(true);

    // Type to replace selection
    await page.keyboard.type('7');
    await page.waitForTimeout(100);

    // Verify content was replaced (should now be just "7" converted to PUA)
    const newLength = await textarea.evaluate(el => el.value.length);
    expect(newLength).toBeLessThan(originalLength);
  });

  test('Select Line works with multi-line document', async ({ editorPage: page }) => {
    // Type first line
    await typeInEditor(page, '1 2 3');
    await page.keyboard.press('Enter');
    // Type second line
    await typeInEditor(page, '4 5 6');
    await page.waitForTimeout(200);

    // Get second line textarea
    const textarea1 = page.locator('[data-testid="notation-textarea-1"]');

    // Open Line menu and click Select Line (should select current line only)
    await page.getByRole('button', { name: 'Line' }).click();
    await page.waitForTimeout(100);
    await page.locator('#menu-select-all').click();
    await page.waitForTimeout(200);

    // Verify second line is selected
    const selection = await textarea1.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      isFullLine: el.selectionStart === 0 && el.selectionEnd === el.value.length
    }));

    expect(selection.isFullLine).toBe(true);
  });
});
