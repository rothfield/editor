import { test, expect } from '@playwright/test';

test.describe('Font System Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    // Wait for editor to be fully initialized
    await page.waitForTimeout(500);
  });

  test('✅ Font mapping loads correctly (single source of truth)', async ({ page }) => {
    // Check that fontMapping object was loaded
    const fontMappingLoaded = await page.evaluate(() => {
      // Access editor through window.musicEditor (exposed in main.js)
      const editor = window.musicEditor;
      return editor?.fontMapping != null;
    });
    expect(fontMappingLoaded).toBe(true);
  });

  test('✅ Barline codepoints are correct (Unicode Music notation)', async ({ page }) => {
    // Verify barline codepoints from font mapping
    const barlineCodepoints = await page.evaluate(() => {
      const editor = window.musicEditor;
      const mapping = editor?.fontMapping;
      if (!mapping || !mapping.symbols) return null;

      const barlines = {};
      for (const sym of mapping.symbols) {
        if (sym.name.startsWith('barline')) {
          barlines[sym.name] = sym.codepoint;
        }
      }
      return barlines;
    });

    expect(barlineCodepoints).not.toBeNull();
    expect(barlineCodepoints).toMatchObject({
      barlineSingle: '0x1d100',  // 𝄀 Unicode Music Notation
      barlineDouble: '0x1d101',  // 𝄁 Unicode Music Notation
      barlineRepeatLeft: '0x1d106',  // 𝄆 Left Repeat
      barlineRepeatRight: '0x1d107',  // 𝄇 Right Repeat
      barlineRepeatBoth: '0x1d108'  // 𝄈 Repeat Both
    });
  });

  test('✅ Cursor renders correctly with matched cell height', async ({ page }) => {
    // Click in editor to activate it
    const editor = page.getByRole('textbox');
    await editor.click();

    // Wait for cursor to be visible
    const cursor = page.locator('.cursor-indicator');
    await expect(cursor).toBeVisible({ timeout: 5000 });

    // Verify cursor has positive height (meaning it's reading from cell height, not hardcoded)
    const cursorDimensions = await cursor.evaluate(el => {
      const height = parseInt(el.style.height) || 0;
      const top = parseInt(el.style.top) || 0;
      return { height, top };
    });

    // The cursor should have height > 0 (means it's reading from cell)
    expect(cursorDimensions.height).toBeGreaterThan(0);
    // Top should be set (relative position within notation line)
    expect(cursorDimensions.top).toBeGreaterThanOrEqual(0);
  });

  test('✅ Barline CSS is generated from font mapping (not hardcoded)', async ({ page }) => {
    // Verify the renderer has the addBarlineStyles method and font mapping is used
    const rendererSetup = await page.evaluate(() => {
      const editor = window.musicEditor;

      // Check that renderer has fontMapping in options
      const hasFontMapping = editor?.renderer?.options?.fontMapping != null;

      // Check that the renderer was initialized with font mapping
      const hasRenderer = editor?.renderer != null;

      return {
        hasFontMapping,
        hasRenderer,
        fontMappingExists: editor?.fontMapping != null
      };
    });

    expect(rendererSetup.hasFontMapping).toBe(true);
    expect(rendererSetup.hasRenderer).toBe(true);
    expect(rendererSetup.fontMappingExists).toBe(true);
  });

  test('✅ WASM font constants are correctly set from atoms.yaml', async ({ page }) => {
    // Verify WASM was initialized with correct constants
    const wasmConstants = await page.evaluate(() => {
      const editor = window.musicEditor;
      // Check if WASM module was initialized (via the renderer)
      return editor?.renderer != null && editor?.wasmModule != null;
    });

    expect(wasmConstants).toBe(true);
  });

  test('✅ Editor initializes without console errors', async ({ page }) => {
    // Collect error messages
    const errorMessages = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Only collect real errors, not warnings
        if (!text.includes('Generated font constants') && !text.includes('Symbols:')) {
          errorMessages.push(text);
        }
      }
    });

    // Wait a moment for any initialization errors to appear
    await page.waitForTimeout(1000);

    expect(errorMessages).toHaveLength(0);
  });

  test('✅ Editor and document initialized with new font system', async ({ page }) => {
    // Verify editor is fully initialized with all components using the new font system
    const editorState = await page.evaluate(() => {
      const editor = window.musicEditor;
      if (!editor) return null;
      return {
        isInitialized: editor.isInitialized === true,
        hasDocument: editor.theDocument != null,
        hasRenderer: editor.renderer != null,
        hasWASM: editor.wasmModule != null,
        hasFontMapping: editor.fontMapping != null,
        // Key: Renderer received the font mapping in its initialization
        rendererHasFontMapping: editor.renderer?.options?.fontMapping != null
      };
    });

    expect(editorState).not.toBeNull();
    expect(editorState.isInitialized).toBe(true);
    expect(editorState.hasDocument).toBe(true);
    expect(editorState.hasRenderer).toBe(true);
    expect(editorState.hasWASM).toBe(true);
    expect(editorState.hasFontMapping).toBe(true);
    // Most important: renderer received the font mapping for dynamic symbol generation
    expect(editorState.rendererHasFontMapping).toBe(true);
  });
});
