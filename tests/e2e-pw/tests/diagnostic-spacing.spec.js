import { test, expect } from '@playwright/test';

test('diagnostic: text spacing appears correct', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type some text
  await page.keyboard.type('Hello World');

  // Wait for rendering
  await page.waitForTimeout(300);

  // Check document content
  const doc = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return app.editor.theDocument.lines[0].cells.map(c => c.char).join('');
  });

  console.log(`Document content: "${doc}"`);
  expect(doc).toBe('Hello World');

  // Check that cells have reasonable x positions (should be increasing)
  const positions = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const displayList = app.editor.displayList;
    if (!displayList || !displayList.lines || !displayList.lines[0]) {
      return null;
    }
    return displayList.lines[0].cells.map(c => ({ char: c.char, x: c.x }));
  });

  console.log('Cell positions:', JSON.stringify(positions, null, 2));

  // Verify positions are increasing (each cell is to the right of the previous)
  if (positions) {
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      console.log(`Cell ${i}: "${curr.char}" at x=${curr.x}, previous "${prev.char}" at x=${prev.x}`);
      expect(curr.x).toBeGreaterThan(prev.x);
    }
  }
});
