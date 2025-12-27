import { test, expect } from '../fixtures/editor.fixture';

/**
 * Lyric alignment tests
 *
 * Tests that lyrics are positioned under their corresponding pitched notes,
 * with collision avoidance ensuring no overlap between adjacent syllables.
 *
 * CSS uses: transform: translateX(-50%) which centers items on their left position.
 * The WASM collision avoidance algorithm accounts for this centered positioning.
 */
test.describe('Lyric alignment under notes', () => {

  test('long syllables should not collide visually', async ({ editorPage: page }) => {
    // Test with wide syllables that would collide without proper algorithm
    const markup = `<title>Test</title>
<notation>number</notation>

<system 1/>| 1 2 |
<lyrics>willam shakespear</lyrics>`;

    await page.evaluate(async (content) => {
      const doc = window.editor.wasmModule.importNotationMarkup(0, content);
      await window.editor.loadDocument(doc);
    }, markup);

    // Wait for render to complete
    await page.waitForTimeout(300);

    // Get all lyric items and verify count
    const lyricItems = page.locator('.lyric-item');
    const count = await lyricItems.count();
    expect(count).toBe(2);

    // Get bounding boxes for collision check
    const firstLyric = lyricItems.nth(0);
    const secondLyric = lyricItems.nth(1);

    const firstBox = await firstLyric.boundingBox();
    const secondBox = await secondLyric.boundingBox();

    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();

    // Verify no visual collision using bounding boxes
    const firstRightEdge = firstBox.x + firstBox.width;
    const secondLeftEdge = secondBox.x;

    expect(firstRightEdge).toBeLessThanOrEqual(
      secondLeftEdge + 2, // Allow 2px tolerance
      `Visual collision: first lyric ends at ${firstRightEdge}, second starts at ${secondLeftEdge}`
    );
  });

  test('lyric positions should increase from left to right', async ({ editorPage: page }) => {
    // Verify lyrics are ordered correctly
    const markup = `<title>Test</title>
<notation>number</notation>

<system 1/>| 1 2 |
<lyrics>do re</lyrics>`;

    await page.evaluate(async (content) => {
      const doc = window.editor.wasmModule.importNotationMarkup(0, content);
      await window.editor.loadDocument(doc);
    }, markup);

    await page.waitForTimeout(300);

    // Get lyric CSS left values
    const lyricLeftValues = await page.evaluate(() => {
      const items = document.querySelectorAll('.lyric-item');
      return Array.from(items).map(item => {
        const style = window.getComputedStyle(item);
        return parseFloat(style.left) || 0;
      });
    });

    // Verify we have 2 lyrics and they're ordered correctly
    expect(lyricLeftValues.length).toBe(2);
    expect(lyricLeftValues[1]).toBeGreaterThan(lyricLeftValues[0]);
    expect(lyricLeftValues[0]).toBeGreaterThanOrEqual(0);
    expect(lyricLeftValues[1]).toBeGreaterThan(0);
  });
});
