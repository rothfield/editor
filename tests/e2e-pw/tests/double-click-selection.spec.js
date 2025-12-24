import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

/**
 * Double-click selection tests
 *
 * In the textarea-based editor, double-click selects a "beat" - the characters
 * between spaces. This is handled by MouseHandler.handleDoubleClick() since
 * native browser word selection doesn't work with PUA codepoints.
 */
test.describe('Double-click beat selection', () => {

  test('double-click on single beat selects that beat', async ({ editorPage: page }) => {
    // Type a single beat
    await typeInEditor(page, '1');
    await page.waitForTimeout(100);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const box = await textarea.boundingBox();

    // Double-click on the beat
    await page.mouse.dblclick(box.x + 20, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Verify selection covers the entire beat
    const selection = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.selectionEnd - el.selectionStart
    }));

    expect(selection.start).toBe(0);
    expect(selection.length).toBe(1); // Single beat character
  });

  test('double-click selects beat between spaces', async ({ editorPage: page }) => {
    // Type multiple beats: "1 2 3"
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(100);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // First, click to set cursor in the middle beat area
    // Use keyboard navigation to position cursor precisely
    await textarea.click();
    await page.keyboard.press('Home'); // Go to start
    await page.keyboard.press('ArrowRight'); // Move past "1"
    await page.keyboard.press('ArrowRight'); // Move past " "
    await page.keyboard.press('ArrowRight'); // Move into "2"

    // Now get cursor position and use that for double-click
    const cursorInfo = await textarea.evaluate(el => {
      const pos = el.selectionStart;
      return { cursorPos: pos, value: el.value };
    });

    const box = await textarea.boundingBox();
    // Double-click at current cursor position (middle of textarea)
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Verify a beat is selected (length should be 1 for single beat)
    const selection = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.selectionEnd - el.selectionStart,
      value: el.value
    }));

    // Double-click should select exactly one beat (one character)
    expect(selection.length).toBe(1);
    // The selected character should be between spaces (not a space itself)
    const selectedChar = selection.value[selection.start];
    expect(selectedChar).not.toBe(' ');
  });

  test('double-click on space does not expand selection to adjacent beats', async ({ editorPage: page }) => {
    // Type beats with spaces between them
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(100);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');

    // Position cursor on the space between beats using keyboard
    await textarea.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // After "1"

    // Get the space position
    const spacePos = await textarea.evaluate(el => el.selectionStart);

    // Verify we're on a space
    const charAtPos = await textarea.evaluate(el => el.value[el.selectionStart]);
    expect(charAtPos).toBe(' ');

    // Now double-click at same position
    const box = await textarea.boundingBox();
    // Click near the left side where the space should be (after first beat)
    await page.mouse.dblclick(box.x + 30, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // When double-clicking on a space, selection should not include multiple beats
    const selection = await textarea.evaluate(el => {
      const value = el.value;
      const selectedText = value.substring(el.selectionStart, el.selectionEnd);
      // Count spaces in selection
      const spaceCount = (selectedText.match(/ /g) || []).length;
      return {
        start: el.selectionStart,
        end: el.selectionEnd,
        length: el.selectionEnd - el.selectionStart,
        spaceCount
      };
    });

    // Selection should be at most 1 character (single beat) or empty
    // It should NOT select across multiple spaces (which would mean multiple beats)
    expect(selection.spaceCount).toBeLessThanOrEqual(0);
  });

  test('double-click on multi-character beat selects entire beat', async ({ editorPage: page }) => {
    // Type beat with dashes: "1--2" (one beat with rhythm extension)
    await typeInEditor(page, '1--2');
    await page.waitForTimeout(200);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const value = await textarea.evaluate(el => el.value);
    const box = await textarea.boundingBox();

    // Double-click somewhere in the beat
    const charWidth = box.width / value.length;
    await page.mouse.dblclick(box.x + (1.5 * charWidth), box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Verify entire beat is selected
    const selection = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      valueLength: el.value.length
    }));

    // Entire beat should be selected (all characters between spaces)
    expect(selection.start).toBe(0);
    expect(selection.end).toBe(selection.valueLength);
  });

  test('double-click on second of multiple beats selects only that beat', async ({ editorPage: page }) => {
    // Type two distinct beats: "1--2 3-4-"
    await typeInEditor(page, '1--2 3-4-');
    await page.waitForTimeout(200);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const value = await textarea.evaluate(el => el.value);
    const box = await textarea.boundingBox();

    // Find the space position to calculate second beat start
    const spaceIndex = await textarea.evaluate(el => el.value.indexOf(' '));
    const charWidth = box.width / value.length;

    // Double-click in the second beat (after the space)
    const secondBeatX = box.x + ((spaceIndex + 1.5) * charWidth);
    await page.mouse.dblclick(secondBeatX, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Verify only second beat is selected
    const selection = await textarea.evaluate(el => {
      const value = el.value;
      const spaceIdx = value.indexOf(' ');
      return {
        start: el.selectionStart,
        end: el.selectionEnd,
        spaceIndex: spaceIdx,
        isAfterSpace: el.selectionStart > spaceIdx,
        selectedText: value.substring(el.selectionStart, el.selectionEnd)
      };
    });

    expect(selection.isAfterSpace).toBe(true);
    expect(selection.start).toBe(selection.spaceIndex + 1);
  });

  test('double-click preserves focus on textarea', async ({ editorPage: page }) => {
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(100);

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const box = await textarea.boundingBox();

    // Double-click
    await page.mouse.dblclick(box.x + 20, box.y + box.height / 2);
    await page.waitForTimeout(100);

    // Verify textarea still has focus
    const hasFocus = await textarea.evaluate(el => document.activeElement === el);
    expect(hasFocus).toBe(true);
  });
});
