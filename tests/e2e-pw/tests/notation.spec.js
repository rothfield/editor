import { test, expect } from '../fixtures/editor.fixture';
import {
  clearEditor,
  getEditorState,
  typeInEditor,
  getRenderedContent,
  pressReturn,
  getCursorPosition,
} from '../utils/editor.helpers';

test.describe('Music Notation Features', () => {
  test('should handle adjacent number notation', async ({ editorPage: page }) => {
    await typeInEditor(page, '1234567');

    const content = await getRenderedContent(page);
    expect(content).toContain('1234567');
  });

  test('should handle notes with accidentals adjacent', async ({ editorPage: page }) => {
    await typeInEditor(page, '1#2b3##4bb5');

    const content = await getRenderedContent(page);
    expect(content).toContain('#');
    expect(content).toContain('b');
  });

  test('should handle sharp accidentals', async ({ editorPage: page }) => {
    await typeInEditor(page, '1#2#3#4#');

    const content = await getRenderedContent(page);
    expect(content).toContain('#');
  });

  test('should handle flat accidentals', async ({ editorPage: page }) => {
    await typeInEditor(page, '1b2b3b4b');

    const content = await getRenderedContent(page);
    expect(content).toContain('b');
  });

  test('should handle double accidentals', async ({ editorPage: page }) => {
    await typeInEditor(page, '1##2##3bb4bb');

    const content = await getRenderedContent(page);
    const sharpCount = (content.match(/#/g) || []).length;
    const flatCount = (content.match(/b/g) || []).length;

    expect(sharpCount).toBeGreaterThanOrEqual(2);
    expect(flatCount).toBeGreaterThanOrEqual(2);
  });

  test('should handle mixed notation with spaces', async ({ editorPage: page }) => {
    await typeInEditor(page, '1#2 3b4 5');

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThan(0);
  });

  test('should handle rhythm notation with rest markers', async ({ editorPage: page }) => {
    await typeInEditor(page, '1 - 2 -');

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThan(0);
  });

  test('should handle line breaks for staves', async ({ editorPage: page }) => {
    await typeInEditor(page, '1234');
    await pressReturn(page);
    await typeInEditor(page, '5671');

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThanOrEqual(2);
  });

  test('should maintain document structure with complex notation', async ({ editorPage: page }) => {
    const complexNotation = '1#2b3 4##567';
    await typeInEditor(page, complexNotation);

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThan(0);
    expect(state.lines.length).toBeGreaterThan(0);
  });

  test('should handle rapid adjacent note entry', async ({ editorPage: page }) => {
    const rapidNotation = '12345671234567'.repeat(3);
    await typeInEditor(page, rapidNotation, { delay: 0 });

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThan(0);
  });

  test('should handle all seven scale degrees adjacent', async ({ editorPage: page }) => {
    await typeInEditor(page, '1234567');

    const content = await getRenderedContent(page);
    const hasAllNotes = [1, 2, 3, 4, 5, 6, 7].every((n) => content.includes(n.toString()));
    expect(hasAllNotes).toBe(true);
  });

  test('should handle accidentals on consecutive notes', async ({ editorPage: page }) => {
    await typeInEditor(page, '1#2#3b4b5##6bb7');

    const content = await getRenderedContent(page);
    expect(content.length).toBeGreaterThan(7);
    expect(content).toMatch(/[#b]/);
  });

  test('should handle mixed adjacent and spaced notation', async ({ editorPage: page }) => {
    await typeInEditor(page, '123 4#5 6b7');

    const content = await getRenderedContent(page);
    expect(content).toContain('123');
  });

  test('should preserve notation across multiple lines', async ({ editorPage: page }) => {
    await typeInEditor(page, '1#2#3b');
    await pressReturn(page);
    await typeInEditor(page, '4##5 6b7');

    const state = await getEditorState(page);
    expect(state.lineCount).toBeGreaterThanOrEqual(2);
  });
});
