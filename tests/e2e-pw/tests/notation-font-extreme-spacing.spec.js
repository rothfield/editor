import { test, expect } from '@playwright/test';

test('Notation font - extreme spacing (cache-busting)', async ({ page }) => {
    // Set cache disabled for this specific test
    await page.context().setExtraHTTPHeaders({
        'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    
    // Navigate with cache busting
    await page.goto('http://localhost:8080/test-notation-font-minimal.html?t=' + Date.now(), {
        waitUntil: 'networkidle'
    });
    
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/font-extreme-spacing.png', fullPage: true });
    
    console.log('✓ Extreme spacing screenshot taken');
});
