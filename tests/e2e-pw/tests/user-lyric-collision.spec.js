import { test, expect } from '../fixtures/editor.fixture';

/**
 * Test the exact user scenario that shows lyric collision.
 * Input: | 1 - - 2 3 - - 1 | 3 1 3 - | |
 * Lyrics: do a deer a fe-male deer
 */
test.describe('User lyric collision bug', () => {
  test('exact user scenario should not have collision', async ({ editorPage: page }) => {
    const markup = '<title>Test</title>\n<notation>number</notation>\n\n<system 1/>| 1 - - 2 3 - - 1 | 3 1 3 - | |\n<lyrics>do a deer a fe-male deer</lyrics>';

    await page.evaluate(async (content) => {
      const doc = window.editor.wasmModule.importNotationMarkup(0, content);
      await window.editor.loadDocument(doc);
    }, markup);

    await page.waitForTimeout(500);

    const lyricItems = page.locator('.lyric-item');
    const count = await lyricItems.count();
    console.log('Found ' + count + ' lyric items');

    // Print all positions for debugging
    for (let i = 0; i < count; i++) {
      const lyric = lyricItems.nth(i);
      const text = await lyric.textContent();
      const box = await lyric.boundingBox();
      console.log('Lyric ' + i + ': "' + text + '" at x=' + box.x.toFixed(1) + ', width=' + box.width.toFixed(1) + ', ends=' + (box.x + box.width).toFixed(1));
    }

    // Check adjacent pairs for collision
    for (let i = 0; i < count - 1; i++) {
      const current = lyricItems.nth(i);
      const next = lyricItems.nth(i + 1);
      const currentBox = await current.boundingBox();
      const nextBox = await next.boundingBox();
      const currentText = await current.textContent();
      const nextText = await next.textContent();

      const currentRight = currentBox.x + currentBox.width;
      const nextLeft = nextBox.x;

      console.log('Check ' + i + ': "' + currentText + '" ends=' + currentRight.toFixed(1) + ', "' + nextText + '" starts=' + nextLeft.toFixed(1));

      expect(currentRight).toBeLessThanOrEqual(
        nextLeft + 2,
        'Lyric ' + i + ' ("' + currentText + '") ends at ' + currentRight.toFixed(1) + ' but "' + nextText + '" starts at ' + nextLeft.toFixed(1)
      );
    }
  });
});
