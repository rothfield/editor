import { test, expect } from '../fixtures/editor.fixture';

/**
 * Lyric collision tests
 *
 * BUG: Long lyric syllables can overlap with subsequent syllables
 * when rendered in the editor. Each syllable is positioned at its
 * note's x-coordinate without considering the width of previous syllables.
 */
test.describe('Lyric collision prevention', () => {

  test('long syllable should not overlap with next syllable', async ({ editorPage: page }) => {
    // Load document with a long first syllable that would collide
    const markup = `<title>Test</title>
<notation>number</notation>

<system 1/>| | 1 2 3 4 | 5 6 7 1 | |
<lyrics>hipppatimi how are you</lyrics>`;

    await page.evaluate(async (content) => {
      const doc = window.editor.wasmModule.importNotationMarkup(0, content);
      await window.editor.loadDocument(doc);
    }, markup);

    await page.waitForTimeout(300);

    // Get all lyric items and their bounding boxes
    const lyricItems = page.locator('.lyric-item');
    const count = await lyricItems.count();

    expect(count).toBeGreaterThanOrEqual(2);

    // Get bounding rectangles of first two lyrics
    const firstLyric = lyricItems.nth(0);
    const secondLyric = lyricItems.nth(1);

    const firstBox = await firstLyric.boundingBox();
    const secondBox = await secondLyric.boundingBox();

    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    // Check for collision: first lyric's right edge should not exceed second lyric's left edge
    const firstRightEdge = firstBox.x + firstBox.width;
    const secondLeftEdge = secondBox.x;

    // Allow 2px tolerance for rendering differences
    expect(firstRightEdge).toBeLessThanOrEqual(secondLeftEdge + 2);
  });

  test('multiple long syllables should not chain-collide', async ({ editorPage: page }) => {
    // Load document with multiple long syllables
    const markup = `<title>Test</title>
<notation>number</notation>

<system 1/>| 1 2 3 4 |
<lyrics>wonderful beautiful marvelous great</lyrics>`;

    await page.evaluate(async (content) => {
      const doc = window.editor.wasmModule.importNotationMarkup(0, content);
      await window.editor.loadDocument(doc);
    }, markup);

    await page.waitForTimeout(300);

    const lyricItems = page.locator('.lyric-item');
    const count = await lyricItems.count();

    expect(count).toBe(4);

    // Check each pair of adjacent lyrics for collision
    for (let i = 0; i < count - 1; i++) {
      const currentLyric = lyricItems.nth(i);
      const nextLyric = lyricItems.nth(i + 1);

      const currentBox = await currentLyric.boundingBox();
      const nextBox = await nextLyric.boundingBox();

      expect(currentBox).not.toBeNull();
      expect(nextBox).not.toBeNull();

      const currentRightEdge = currentBox.x + currentBox.width;
      const nextLeftEdge = nextBox.x;

      // Lyrics should not overlap (allow 2px tolerance)
      expect(currentRightEdge).toBeLessThanOrEqual(
        nextLeftEdge + 2,
        `Lyric ${i} (right: ${currentRightEdge}) overlaps with lyric ${i+1} (left: ${nextLeftEdge})`
      );
    }
  });

  test('short syllables should render normally without truncation', async ({ editorPage: page }) => {
    // Load document with short syllables that don't need collision handling
    const markup = `<title>Test</title>
<notation>number</notation>

<system 1/>| 1 2 3 4 |
<lyrics>do re mi fa</lyrics>`;

    await page.evaluate(async (content) => {
      const doc = window.editor.wasmModule.importNotationMarkup(0, content);
      await window.editor.loadDocument(doc);
    }, markup);

    await page.waitForTimeout(300);

    const lyricItems = page.locator('.lyric-item');
    const count = await lyricItems.count();

    expect(count).toBe(4);

    // Verify all syllables are fully visible (not truncated)
    const texts = await lyricItems.allTextContents();
    expect(texts).toEqual(['do', 're', 'mi', 'fa']);
  });
});
