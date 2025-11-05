/**
 * E2E Test: Document Title Rendering
 *
 * Tests that document title appears in the visual layout.
 * Per CLAUDE.md: Inspector-first testing approach
 *
 * EXPECTED TO FAIL: Title rendering is currently disabled in renderer.js:491
 *
 * Bug location: src/js/renderer.js:491 - "Title display disabled - only show composer if present"
 *
 * Test demonstrates:
 * 1. Title exists in Document Model (✓)
 * 2. Title exists in WASM Display List (✓)
 * 3. Title is NOT rendered in DOM (✗) <- THE BUG
 */

import { test, expect } from '@playwright/test';
import { openTab, readPaneText, getDocumentModel, getWASMLayout } from '../helpers/inspectors.js';

test.describe('Document Title Rendering', () => {
  test('title should appear in visual layout when set', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Set a document title via the document model
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = 'My Test Composition';
        // Trigger re-render
        app.editor.render();
      }
    });

    // Type some musical content so we have something to render
    await page.keyboard.type('S r g m |');

    // Give the editor time to update
    await page.waitForTimeout(200);

    // Step 1: Verify title is in the Document Model (data layer)
    const docModel = await getDocumentModel(page);
    expect(docModel.title).toBe('My Test Composition');

    // Step 2: Verify title is in the Display List (WASM layout layer)
    const displayListText = await getWASMLayout(page);
    expect(displayListText).toContain('My Test Composition');

    // Step 3: Verify title appears in the DOM (visual layer)
    // ⚠️ THIS IS WHERE THE TEST FAILS - title rendering is disabled
    const headerContainer = page.locator('.document-header');
    await expect(headerContainer).toBeVisible({ timeout: 2000 });

    // Should have a title element inside the header
    const titleElement = headerContainer.locator('.document-title');
    await expect(titleElement).toBeVisible();

    const titleText = await titleElement.textContent();
    expect(titleText).toContain('My Test Composition');
  });

  test('title with composer should both appear', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Set both title and composer
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = 'Raga Bhairavi';
        app.editor.theDocument.composer = 'Traditional';
        app.editor.render();
      }
    });

    await page.keyboard.type('S r g m');
    await page.waitForTimeout(200);

    // Verify in Document Model
    const docModel = await getDocumentModel(page);
    expect(docModel.title).toBe('Raga Bhairavi');
    expect(docModel.composer).toBe('Traditional');

    // Verify header is visible
    const headerContainer = page.locator('.document-header');
    await expect(headerContainer).toBeVisible({ timeout: 2000 });

    // ⚠️ THIS WILL FAIL - composer renders but title doesn't
    const titleElement = headerContainer.locator('.document-title');
    await expect(titleElement).toBeVisible();
    expect(await titleElement.textContent()).toContain('Raga Bhairavi');

    // Composer should work (it's already implemented)
    const composerElement = headerContainer.locator('.document-composer');
    await expect(composerElement).toBeVisible();
    expect(await composerElement.textContent()).toContain('Traditional');
  });

  test('title should NOT appear for "Untitled Document"', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Set title to "Untitled Document"
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = 'Untitled Document';
        app.editor.render();
      }
    });

    await page.keyboard.type('S r g m');
    await page.waitForTimeout(200);

    // Verify "Untitled Document" is NOT rendered in DOM
    const titleElement = page.locator('.document-title');
    await expect(titleElement).not.toBeVisible();
  });

  test('title should update when changed', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Set initial title
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = 'Original Title';
        app.editor.render();
      }
    });

    await page.keyboard.type('S r g m');
    await page.waitForTimeout(200);

    // Verify initial title in DOM
    let titleElement = page.locator('.document-title');
    await expect(titleElement).toContainText('Original Title');

    // Change title
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = 'Updated Title';
        app.editor.render();
      }
    });

    await page.waitForTimeout(200);

    // Verify updated title in DOM
    await expect(titleElement).toContainText('Updated Title');
    await expect(titleElement).not.toContainText('Original Title');
  });

  test('empty title should not render header element', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Explicitly set empty title
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = '';
        app.editor.theDocument.composer = ''; // Also empty composer
        app.editor.render();
      }
    });

    await page.keyboard.type('S r g m');
    await page.waitForTimeout(200);

    // Verify no header container is rendered
    const headerContainer = page.locator('.document-header');
    await expect(headerContainer).not.toBeVisible();
  });

  test('title should be properly positioned above musical content', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = 'Positioned Title Test';
        app.editor.render();
      }
    });

    await page.keyboard.type('S r g m | P d n S\'');
    await page.waitForTimeout(200);

    // ⚠️ THIS WILL FAIL - title element doesn't exist
    const titleElement = page.locator('.document-title');
    await expect(titleElement).toBeVisible();

    const firstLine = page.locator('.notation-line').first();
    await expect(firstLine).toBeVisible();

    const titleBox = await titleElement.boundingBox();
    const lineBox = await firstLine.boundingBox();

    // Title should be above the first line
    expect(titleBox.y + titleBox.height).toBeLessThan(lineBox.y);
  });

  test('title should be centered horizontally', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (app?.editor?.theDocument) {
        app.editor.theDocument.title = 'Centered Title';
        app.editor.render();
      }
    });

    await page.keyboard.type('S r g m');
    await page.waitForTimeout(200);

    // ⚠️ THIS WILL FAIL - title element doesn't exist
    const titleElement = page.locator('.document-title');
    await expect(titleElement).toBeVisible();

    // Verify title is centered (text-align: center)
    const textAlign = await titleElement.evaluate((el) =>
      window.getComputedStyle(el).textAlign
    );
    expect(textAlign).toBe('center');
  });
});
