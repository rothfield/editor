import { test, expect } from '../fixtures/editor.fixture';

/**
 * Lyric hyphenation tests
 *
 * When lyrics contain hyphens (e.g., "shake-spear"), each syllable
 * should be positioned under its corresponding note.
 *
 * Input: | 1 2 3 | with lyrics "willam shake-spear"
 * Expected:
 *   - "willam" under note 1
 *   - "shake-" under note 2
 *   - "spear" under note 3
 */
test.describe('Lyric hyphenation', () => {

  test('hyphenated syllables should each align to their own note', async ({ editorPage: page }) => {
    const markup = `<title>Test</title>
<notation>number</notation>

<system 1/>| 1 2 3 |
<lyrics>willam shake-spear</lyrics>`;

    await page.evaluate(async (content) => {
      const doc = window.editor.wasmModule.importNotationMarkup(0, content);
      await window.editor.loadDocument(doc);
    }, markup);

    await page.waitForTimeout(300);

    // Get all lyric items
    const lyricItems = page.locator('.lyric-item');
    const count = await lyricItems.count();

    // Should have 3 syllables: "willam", "shake-", "spear"
    expect(count).toBe(3);

    // Get the text content of each lyric
    const texts = await lyricItems.allTextContents();

    // Verify the syllables are correct
    expect(texts[0]).toBe('willam');
    expect(texts[1]).toBe('shake-');
    expect(texts[2]).toBe('spear');

    // Get bounding boxes to verify positioning
    const boxes = [];
    for (let i = 0; i < count; i++) {
      const box = await lyricItems.nth(i).boundingBox();
      boxes.push(box);
    }

    // Verify "spear" is positioned to the right of "shake-"
    // (i.e., under note 3, not overlapping with note 2)
    expect(boxes[2].x).toBeGreaterThan(boxes[1].x + boxes[1].width - 2);
  });
});
