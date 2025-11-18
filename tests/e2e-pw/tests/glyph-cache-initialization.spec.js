import { test, expect } from '@playwright/test';

test.describe('Glyph Width Cache Initialization', () => {
  test('should initialize glyph cache at startup and render correctly', async ({ page }) => {
    const logs = [];
    const errors = [];

    // Capture console logs
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (msg.type() === 'log') {
        console.log('[BROWSER LOG]', text);
      }
    });

    // Capture errors
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error('[PAGE ERROR]', error.message);
    });

    // Navigate to the app
    await page.goto('/');

    // Wait for the editor to be visible
    const editorRoot = page.locator('[data-testid="editor-root"]');
    await expect(editorRoot).toBeVisible({ timeout: 10000 });

    // Wait a bit for initialization to complete
    await page.waitForTimeout(1000);

    // Verify cache initialization logs
    const cacheInitLogs = logs.filter(log =>
      log.includes('Initializing glyph width cache') ||
      log.includes('Glyph width cache initialized') ||
      log.includes('setGlyphWidthCache called') ||
      log.includes('Measured') && log.includes('glyphs')
    );

    console.log('\n=== Cache Initialization Logs ===');
    cacheInitLogs.forEach(log => console.log(log));
    console.log('=================================\n');

    // Verify cache was initialized
    expect(cacheInitLogs.length).toBeGreaterThan(0);

    // Verify no errors occurred
    if (errors.length > 0) {
      console.error('\n=== ERRORS ===');
      errors.forEach(err => console.error(err));
      console.error('==============\n');
    }
    expect(errors).toHaveLength(0);

    // Type some characters to verify rendering works
    await editorRoot.click();
    await page.keyboard.type('1 2 3');

    // Wait for rendering
    await page.waitForTimeout(500);

    // Verify cells are rendered
    const cells = page.locator('.char-cell');
    const cellCount = await cells.count();

    console.log(`\nRendered ${cellCount} cells`);
    expect(cellCount).toBeGreaterThan(0);

    // Verify at least one cell has actual width
    const firstCell = cells.first();
    await expect(firstCell).toBeVisible();

    const bbox = await firstCell.boundingBox();
    console.log(`First cell bbox:`, bbox);
    expect(bbox).not.toBeNull();
    expect(bbox.width).toBeGreaterThan(0);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'artifacts/glyph-cache-test.png' });

    console.log('\n✅ Glyph cache initialization test PASSED');
  });
});
