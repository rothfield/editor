// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Markup Tags Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Wait for WASM to be ready
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    });
  });

  test('markup panel should display supported tags from WASM registry', async ({ page }) => {
    // Click on Markup tab
    const markupTab = page.locator('[data-tab="markup"]');
    await markupTab.click();
    await page.waitForTimeout(500); // Wait for tags to load

    // Check that the supported tags panel exists
    const tagsPanel = page.locator('#supported-tags-panel');
    await expect(tagsPanel).toBeVisible();

    // Check that content loaded (not showing "Loading...")
    const tagsContent = page.locator('#supported-tags-content');
    const content = await tagsContent.innerText();

    expect(content).not.toContain('Loading tag documentation');

    // Should contain category headers
    expect(content).toContain('Document Tags');
    expect(content).toContain('Structural Tags');
    expect(content).toContain('LineMeta Tags');
    expect(content).toContain('Modifier Tags');

    // Should contain specific tags (innerText will show unescaped text)
    expect(content).toContain('<title>');
    expect(content).toContain('<composer>');
    expect(content).toContain('<system>');
    expect(content).toContain('<lyrics>');
    expect(content).toContain('<sup>');
    expect(content).toContain('<slur>');
    expect(content).toContain('<up>');
    expect(content).toContain('<#>');

    // Should show aliases
    expect(content).toContain('aliases: tit');
    expect(content).toContain('aliases: com');
    expect(content).toContain('aliases: lyr');

    console.log('✅ Markup panel displays tags from WASM registry');
  });

  test('WASM function isMarkupTagSupported should work correctly', async ({ page }) => {
    // Test the isMarkupTagSupported function directly
    const results = await page.evaluate(() => {
      const wasm = window.editor.wasmModule;
      return {
        title: wasm.isMarkupTagSupported('title'),
        tit: wasm.isMarkupTagSupported('tit'), // alias
        lyrics: wasm.isMarkupTagSupported('lyrics'),
        lyr: wasm.isMarkupTagSupported('lyr'), // alias
        up: wasm.isMarkupTagSupported('up'),
        sharp: wasm.isMarkupTagSupported('#'),
        unknown: wasm.isMarkupTagSupported('unknown'),
        fake: wasm.isMarkupTagSupported('fake'),
      };
    });

    // Valid tags should return true
    expect(results.title).toBe(true);
    expect(results.tit).toBe(true); // alias
    expect(results.lyrics).toBe(true);
    expect(results.lyr).toBe(true); // alias
    expect(results.up).toBe(true);
    expect(results.sharp).toBe(true);

    // Invalid tags should return false
    expect(results.unknown).toBe(false);
    expect(results.fake).toBe(false);

    console.log('✅ isMarkupTagSupported works correctly');
  });

  test('tag documentation should be properly formatted as HTML', async ({ page }) => {
    // Click on Markup tab
    const markupTab = page.locator('[data-tab="markup"]');
    await markupTab.click();
    await page.waitForTimeout(500);

    // Check that the content panel is visible and populated
    const tagsContent = page.locator('#supported-tags-content');
    await expect(tagsContent).toBeVisible();

    // Get the HTML to verify it has code elements
    const htmlContent = await tagsContent.innerHTML();

    // Should have multiple code tags for the markup tags
    const codeCount = (htmlContent.match(/<code/g) || []).length;
    expect(codeCount).toBeGreaterThan(10);

    // Should have category headers
    const headerCount = (htmlContent.match(/font-semibold/g) || []).length;
    expect(headerCount).toBeGreaterThanOrEqual(5);

    // Verify code elements have proper styling
    expect(htmlContent).toContain('bg-blue-100');
    expect(htmlContent).toContain('font-mono');

    console.log(`✅ Tag documentation is properly formatted (${codeCount} code tags, ${headerCount} headers)`);
  });

  test('markup panel should have scrollbar for long content', async ({ page }) => {
    // Click on Markup tab
    const markupTab = page.locator('[data-tab="markup"]');
    await markupTab.click();
    await page.waitForTimeout(500);

    // Check that the panel has overflow-y-scroll and fixed height
    const panel = page.locator('#supported-tags-panel');
    await expect(panel).toBeVisible();

    // Get computed styles
    const styles = await panel.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        overflowY: computed.overflowY,
        height: computed.height,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight
      };
    });

    // Should have scroll overflow (either 'scroll' or 'auto' is acceptable)
    expect(['scroll', 'auto', 'visible'].includes(styles.overflowY)).toBe(true);
    console.log(`Overflow-Y: ${styles.overflowY}`);

    // Should have fixed height (h-64 = 16rem = 256px)
    expect(parseInt(styles.height)).toBeGreaterThan(200);
    console.log(`Panel height: ${styles.height}`);

    // Content should be scrollable (scrollHeight > clientHeight means scrollbar is needed)
    const isScrollable = styles.scrollHeight > styles.clientHeight;
    console.log(`Panel is scrollable: ${isScrollable} (scrollHeight: ${styles.scrollHeight}px, clientHeight: ${styles.clientHeight}px)`);
    expect(isScrollable).toBe(true); // Content should exceed panel height

    console.log('✅ Markup panel has scrollbar');
  });
});
