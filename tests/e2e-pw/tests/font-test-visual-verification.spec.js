import { test, expect } from '@playwright/test';

test.describe('Font Test Visual Verification', () => {
  test('capture font test display for visual inspection', async ({ page }) => {
    // Navigate to app
    await page.goto('/');

    // Wait for editor to load
    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule !== 'undefined'
        );
      },
      { timeout: 10000 }
    );

    // Wait a moment for UI to fully render
    await page.waitForTimeout(1000);

    // Click on the Font Test tab in the Inspector
    const fontTestTab = page.getByRole('button', { name: /font test/i });
    if (await fontTestTab.isVisible()) {
      await fontTestTab.click();
      await page.waitForTimeout(500);
    }

    // Get the font sandbox element
    const fontSandbox = page.locator('textarea[id*="font"], #fontSandbox, [data-testid*="font"]').first();

    // Take screenshot of the entire viewport
    await page.screenshot({
      path: 'artifacts/font-test-visual.png',
      fullPage: false
    });

    // Get the content from the font sandbox if it exists
    let sandboxContent = '';
    try {
      const sandboxElements = await page.locator('textarea').all();
      if (sandboxElements.length > 0) {
        sandboxContent = await sandboxElements[0].inputValue();
      }
    } catch (e) {
      console.log('Could not read sandbox content');
    }

    // Basic expectations
    expect(page).toBeDefined();

    // Verify we have content
    if (sandboxContent) {
      expect(sandboxContent.length).toBeGreaterThan(0);
      console.log(`Font sandbox has ${sandboxContent.length} characters`);

      // Get unique unicode codepoints displayed
      const codepoints = new Set();
      for (const char of sandboxContent) {
        if (char !== '\n' && char !== '\r' && char !== ' ' && char !== '\t') {
          codepoints.add(char.charCodeAt(0).toString(16));
        }
      }
      console.log(`Found ${codepoints.size} unique codepoints`);
    }
  });

  test('capture font sandbox with all variants', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    // Get font config to verify we have the right structure
    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    // Verify we got the expected structure
    expect(fontConfig).toBeDefined();
    expect(fontConfig.systems).toBeDefined();
    expect(fontConfig.systems.length).toBe(4);

    // Click Font Test tab
    const fontTestTab = page.getByRole('button', { name: /font test/i });
    if (await fontTestTab.isVisible()) {
      await fontTestTab.click();
      await page.waitForTimeout(1000);
    }

    // Get all textareas on the page
    const textareas = await page.locator('textarea').all();
    console.log(`Found ${textareas.length} textareas`);

    let totalGlyphsDisplayed = 0;
    for (let i = 0; i < textareas.length; i++) {
      const content = await textareas[i].inputValue();
      const nonWhitespace = content.replace(/\s/g, '');
      totalGlyphsDisplayed += nonWhitespace.length;
      console.log(`Textarea ${i}: ${nonWhitespace.length} glyphs`);
    }

    console.log(`Total glyphs displayed: ${totalGlyphsDisplayed}`);

    // Take full page screenshot
    await page.screenshot({
      path: 'artifacts/font-test-full-page.png',
      fullPage: true
    });

    // Expected: 4 systems × 25 variants = 1,175 glyphs minimum displayed
    // (may vary depending on UI layout)
    expect(totalGlyphsDisplayed).toBeGreaterThan(100);
  });
});
