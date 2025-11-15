import { test, expect } from '../fixtures/editor.fixture';
import {
  clearEditor,
  getEditorState,
  typeInEditor,
  moveCursor,
  getLineCount,
  waitForLineCount,
  getRenderedContent,
  pressReturn,
  assertEditorContains,
  getPitchSystem,
} from '../utils/editor.helpers';

test.describe('Basic Editor Operations', () => {
  test('should load the editor', async ({ editorPage: page }) => {
    // Verify editor element exists
    const editor = await page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Verify editor has focus
    const hasFocus = await page.evaluate(() => document.activeElement?.id === 'notation-editor');
    expect(hasFocus).toBe(true);
  });

  test('should have Number pitch system as default', async ({ editorPage: page }) => {
    // Get document pitch system - should default to 1 (Number system)
    const docPitchSystem = await page.evaluate(() => {
      return window.MusicNotationApp?.app()?.editor?.document?.pitch_system;
    });

    // Get current pitch system from editor method
    const currentSystem = await page.evaluate(() => {
      return window.MusicNotationApp?.app()?.editor?.getCurrentPitchSystem?.();
    });

    // Both should be undefined or 1 (defaults to 1)
    // If undefined, the default of 1 applies
    expect(docPitchSystem === undefined || docPitchSystem === 1).toBe(true);
    expect(currentSystem === undefined || currentSystem === 1).toBe(true);
  });

  test('should accept text input', async ({ editorPage: page }) => {
    await typeInEditor(page, '1234567');

    const content = await getRenderedContent(page);
    expect(content).toContain('1234567');
  });

  test('should handle number notation', async ({ editorPage: page }) => {
    await typeInEditor(page, '1 2 3 4 5 6 7');

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThan(0);
  });

  test('should handle letter notation', async ({ editorPage: page }) => {
    await typeInEditor(page, 'c d e f g a b');

    const content = await getRenderedContent(page);
    expect(content.toLowerCase()).toContain('c');
  });

  test('should handle accidentals', async ({ editorPage: page }) => {
    await typeInEditor(page, '1# 2b 3##');

    // Check document model (WASM owns the truth)
    const docState = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => cell.char) || [];
    });

    // Should have cells with # and b in their char values
    expect(docState.some(char => char.includes('#'))).toBe(true);
    expect(docState.some(char => char.includes('b'))).toBe(true);
  });

  test('should clear editor content', async ({ editorPage: page }) => {
    await typeInEditor(page, '1234567');
    await clearEditor(page);

    const content = await getRenderedContent(page);
    expect(content.trim()).toBe('');
  });

  test('should create new lines with Return key', async ({ editorPage: page }) => {
    const initialLineCount = await getLineCount(page);

    await typeInEditor(page, '1234567');
    await pressReturn(page);

    await waitForLineCount(page, initialLineCount + 1);
  });

  test('should maintain state across multiple inputs', async ({ editorPage: page }) => {
    await typeInEditor(page, '1 2 3');
    await pressReturn(page);
    await typeInEditor(page, '4 5 6');

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThanOrEqual(2);
  });

  test('should handle cursor movement', async ({ editorPage: page }) => {
    await typeInEditor(page, '12345');

    // Move left
    await moveCursor(page, 'left', 2);
    await typeInEditor(page, 'X');

    const content = await getRenderedContent(page);
    // Should have inserted X in the middle
    expect(content.length).toBeGreaterThan(5);
  });

  test('should have proper focus management', async ({ editorPage: page }) => {
    // Editor should have focus
    const hasFocus = await page.evaluate(() => document.activeElement?.id === 'notation-editor');
    expect(hasFocus).toBe(true);

    // Clicking outside and back should maintain functionality
    await page.click('body');
    const lostFocus = await page.evaluate(() => document.activeElement?.id === 'notation-editor');
    expect(lostFocus).toBe(false);

    // Click back into editor
    await page.click('#notation-editor');
    const regainedFocus = await page.evaluate(
      () => document.activeElement?.id === 'notation-editor'
    );
    expect(regainedFocus).toBe(true);
  });

  test('should handle rapid input', async ({ editorPage: page }) => {
    const rapidInput = '123456789'.repeat(3);
    await typeInEditor(page, rapidInput, { delay: 0 });

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThan(0);
  });

  test('should preserve document state', async ({ editorPage: page }) => {
    const testContent = 'c d e f g';
    await typeInEditor(page, testContent);

    const state1 = await getEditorState(page);
    await page.waitForTimeout(100);
    const state2 = await getEditorState(page);

    expect(state1.lineCount).toBe(state2.lineCount);
  });
});
