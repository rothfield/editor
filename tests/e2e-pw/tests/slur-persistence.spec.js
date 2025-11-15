import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Slur Persistence via localStorage
 *
 * Tests that slurs are saved to localStorage and restored on page reload.
 *
 * This verifies the fix for the issue where slurs were stored in a global
 * ANNOTATIONS variable separate from the Document struct, preventing them
 * from being saved to localStorage.
 *
 * Architecture:
 * - Document.annotation_layer now contains slurs
 * - getDocumentSnapshot() serializes annotation_layer to JSON
 * - AutoSave writes snapshot to localStorage
 * - On page load, document is restored including slurs
 */

test.describe('Slur Persistence - localStorage', () => {
  const AUTOSAVE_LAST_KEY = 'music-editor-autosave-last';
  const AUTOSAVE_PREFIX = 'music-editor-autosave-';

  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('slurs persist across page reload', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    // Type some notation
    await page.keyboard.type('1 2 3 4 5');

    // Wait for content to be visible
    await page.waitForSelector('.char-cell', { state: 'visible' });

    // Apply slurs
    await page.evaluate(() => {
      window.editor.wasmModule.applySlurLayered(0, 0, 3); // "1 2"
      window.editor.wasmModule.applySlurLayered(0, 4, 7); // "3 4"
    });

    // Verify slurs were added
    let slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    expect(slurs.length).toBe(2);

    // Manually trigger autosave (or get document and check it contains slurs)
    const documentBefore = await page.evaluate(() => {
      return window.editor.getDocument();
    });

    console.log('Document annotation_layer before reload:', documentBefore.annotation_layer);

    // Verify annotation_layer is in the document
    expect(documentBefore.annotation_layer).toBeDefined();
    expect(documentBefore.annotation_layer.slurs).toBeDefined();
    expect(documentBefore.annotation_layer.slurs.length).toBe(2);

    // Manually save to localStorage (simulate autosave)
    await page.evaluate((doc) => {
      const AUTOSAVE_LAST_KEY = 'music-editor-autosave-last';
      const AUTOSAVE_PREFIX = 'music-editor-autosave-';

      // Generate save key
      const title = doc.title || 'Untitled';
      const timestamp = new Date().toISOString();
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').substring(0, 50);
      const saveKey = `${AUTOSAVE_PREFIX}${sanitizedTitle}-${timestamp}`;

      // Save document
      localStorage.setItem(saveKey, JSON.stringify(doc));

      // Update last save key pointer
      localStorage.setItem(AUTOSAVE_LAST_KEY, saveKey);

      console.log('[Test] Saved to localStorage:', saveKey);
    }, documentBefore);

    // Verify localStorage contains the data
    const savedData = await page.evaluate(() => {
      const AUTOSAVE_LAST_KEY = 'music-editor-autosave-last';
      const lastSaveKey = localStorage.getItem(AUTOSAVE_LAST_KEY);
      console.log('[Test] Last save key:', lastSaveKey);

      if (!lastSaveKey) {
        return null;
      }

      const data = localStorage.getItem(lastSaveKey);
      console.log('[Test] Retrieved from localStorage:', data ? data.substring(0, 200) + '...' : 'null');
      return data ? JSON.parse(data) : null;
    });

    expect(savedData).not.toBeNull();
    expect(savedData.annotation_layer).toBeDefined();
    expect(savedData.annotation_layer.slurs.length).toBe(2);

    // Reload the page
    console.log('[Test] Reloading page...');
    await page.reload();

    // Wait for editor to be ready again
    await expect(editor).toBeVisible();
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    // Wait for cells to be rendered (editor should restore content)
    await page.waitForSelector('.char-cell', { state: 'visible' });

    // Verify slurs are still present after reload
    slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });

    console.log('Slurs after reload:', slurs);

    // Assert slurs persisted
    expect(slurs.length).toBe(2);

    // Verify first slur
    expect(slurs[0].start.line).toBe(0);
    expect(slurs[0].start.col).toBe(0);
    expect(slurs[0].end.line).toBe(0);
    expect(slurs[0].end.col).toBe(3);

    // Verify second slur
    expect(slurs[1].start.line).toBe(0);
    expect(slurs[1].start.col).toBe(4);
    expect(slurs[1].end.line).toBe(0);
    expect(slurs[1].end.col).toBe(7);

    // Verify document still has annotation_layer
    const documentAfter = await page.evaluate(() => {
      return window.editor.getDocument();
    });

    expect(documentAfter.annotation_layer).toBeDefined();
    expect(documentAfter.annotation_layer.slurs.length).toBe(2);
  });

  test('empty annotation layer persists correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    // Type some notation but don't add slurs
    await page.keyboard.type('1 2 3');

    // Get document and verify empty annotation layer
    const documentBefore = await page.evaluate(() => {
      return window.editor.getDocument();
    });

    expect(documentBefore.annotation_layer).toBeDefined();
    expect(documentBefore.annotation_layer.slurs).toBeDefined();
    expect(documentBefore.annotation_layer.slurs.length).toBe(0);

    // Save to localStorage
    await page.evaluate((doc) => {
      const AUTOSAVE_LAST_KEY = 'music-editor-autosave-last';
      const AUTOSAVE_PREFIX = 'music-editor-autosave-';

      // Generate save key
      const title = doc.title || 'Untitled';
      const timestamp = new Date().toISOString();
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').substring(0, 50);
      const saveKey = `${AUTOSAVE_PREFIX}${sanitizedTitle}-${timestamp}`;

      // Save document
      localStorage.setItem(saveKey, JSON.stringify(doc));

      // Update last save key pointer
      localStorage.setItem(AUTOSAVE_LAST_KEY, saveKey);
    }, documentBefore);

    // Reload
    await page.reload();

    // Wait for editor
    await expect(editor).toBeVisible();
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    // Verify empty slurs array persisted
    const slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });

    expect(slurs.length).toBe(0);
  });
});
