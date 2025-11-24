import { test, expect } from '@playwright/test';

test.describe('Arrow Key Navigation - Unexpected Behavior', () => {
  test('left arrow should only move cursor, not highlight/copy', async ({ page }) => {
    // Capture console logs to check for unexpected copy operations
    const logs = [];
    page.on('console', msg => {
      logs.push({ type: msg.type(), text: msg.text() });
    });

    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1"
    await page.keyboard.type('1');

    // Get clipboard content before arrow press
    const clipboardBefore = await page.evaluate(() => {
      return navigator.clipboard.readText().catch(() => '');
    });

    // Press left arrow
    await page.keyboard.press('ArrowLeft');

    // Wait a moment for any async operations
    await page.waitForTimeout(100);

    // Get clipboard content after arrow press
    const clipboardAfter = await page.evaluate(() => {
      return navigator.clipboard.readText().catch(() => '');
    });

    // Clipboard should NOT have changed
    expect(clipboardAfter).toBe(clipboardBefore);

    // Check if there's a selection (there shouldn't be)
    const selection = await page.evaluate(() => {
      const sel = window.getSelection();
      return {
        text: sel.toString(),
        rangeCount: sel.rangeCount,
        isCollapsed: sel.rangeCount > 0 ? sel.getRangeAt(0).collapsed : true
      };
    });

    // Selection should be collapsed (no text selected)
    expect(selection.isCollapsed).toBe(true);
    expect(selection.text).toBe('');

    // Check logs for unexpected copy operations
    const copyLogs = logs.filter(log =>
      log.text.toLowerCase().includes('copy') ||
      log.text.toLowerCase().includes('clipboard')
    );

    // There should be no copy-related logs from just pressing arrow key
    if (copyLogs.length > 0) {
      console.log('Unexpected copy-related logs:', copyLogs);
    }
  });

  test('left arrow should not trigger selection in WASM layer', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1"
    await page.keyboard.type('1');

    // Press left arrow
    await page.keyboard.press('ArrowLeft');

    // Wait for any WASM updates
    await page.waitForTimeout(100);

    // Check WASM selection state via Document Model inspector
    await page.click('[data-testid="tab-docmodel"]');

    const docModel = page.locator('[data-testid="pane-docmodel"]');
    await expect(docModel).toBeVisible();

    const docModelText = await docModel.innerText();

    // The document model should show cursor position but no selection
    // Selection would typically be indicated by anchor != head or selection_start != selection_end

    // This is a heuristic check - adjust based on actual doc model format
    const hasSelection = docModelText.includes('selection') &&
                        !docModelText.includes('selection: null') &&
                        !docModelText.includes('selection: None');

    // There should be NO active selection
    expect(hasSelection).toBe(false);
  });

  test('sequence: type "1", left arrow, then type "2" should produce "21"', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "1"
    await page.keyboard.type('1');

    // Press left arrow (move cursor before "1")
    await page.keyboard.press('ArrowLeft');

    // Type "2"
    await page.keyboard.type('2');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Check the content
    const content = await editor.textContent();

    // Should be "21" (2 inserted before 1)
    expect(content.trim()).toBe('21');

    // If arrow key is causing highlight/copy, typing "2" might replace "1" instead
    // In that case we'd get just "2", which would be wrong
    expect(content.trim()).not.toBe('2');
    expect(content.trim()).not.toBe('1');
  });

  test('visual check: no selection highlight after left arrow', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "123"
    await page.keyboard.type('123');

    // Press left arrow once
    await page.keyboard.press('ArrowLeft');

    // Wait for rendering
    await page.waitForTimeout(100);

    // Take a screenshot to verify no visual selection
    await page.screenshot({
      path: 'test-results/arrow-no-highlight.png',
      clip: await editor.boundingBox()
    });

    // Check for any elements with "selected" class or data attributes
    const selectedElements = await page.locator('[class*="select"], [data-selected="true"]').count();

    // There should be no selected elements (just cursor)
    expect(selectedElements).toBe(0);
  });
});
