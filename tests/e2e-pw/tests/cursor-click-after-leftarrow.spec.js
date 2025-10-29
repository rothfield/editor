import { test, expect } from '../fixtures/editor.fixture';
import {
  typeInEditor,
  getRenderedContent,
  clearEditor,
} from '../utils/editor.helpers';

test.describe('Cursor Positioning: Click after left-arrow', () => {
  test('should position cursor after "1" when clicked after typing and moving left', async ({
    editorPage: page,
  }) => {
    // Scenario:
    // 1. Type "1"
    // 2. Press left arrow (cursor moves BEFORE "1")
    // 3. Click to the right of "1" (cursor SHOULD move AFTER "1")
    // 4. Type "2"
    // Expected result: "12"
    // Actual result (BUG): "21" (click doesn't update cursor position correctly)

    await clearEditor(page);

    // Step 1: Type "1"
    await typeInEditor(page, '1');
    let content = await getRenderedContent(page);
    expect(content).toContain('1');

    // Step 2: Press left arrow to move cursor before "1"
    await typeInEditor(page, '{ArrowLeft}');

    // Step 3: Click to the right of "1"
    // Get the actual rendered position of the "1" and click to its right
    const clickXPosition = await page.evaluate(() => {
      const editor = document.getElementById('notation-editor');
      if (!editor) return 100; // fallback

      // Find the first character cell element
      const charCell = editor.querySelector('.char-cell');
      if (!charCell) return 100; // fallback

      const editorRect = editor.getBoundingClientRect();
      const cellRect = charCell.getBoundingClientRect();

      // Click position should be at the right edge of the cell
      const rightEdgeX = cellRect.right - editorRect.left;
      return rightEdgeX + 5; // Add 5px to ensure we're to the right
    });

    await page.click('#notation-editor', {
      position: { x: clickXPosition, y: 20 },
    });

    // Step 4: Type "2"
    await typeInEditor(page, '2');

    const finalContent = await getRenderedContent(page);

    // Expected: "12" (cursor should be after "1")
    // Bug: "21" (cursor stays before "1" - click failed to reposition)
    expect(finalContent).toContain('12');
  });
});
