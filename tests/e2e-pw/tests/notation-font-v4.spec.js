import { test, expect } from '@playwright/test';

test('Notation font v4 - reference-based composite glyphs', async ({ page }) => {
    await page.goto('http://localhost:8080/test-notation-font-minimal.html');
    
    await page.waitForLoadState('networkidle');
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/font-v4-test.png', fullPage: true });
    
    // Verify glyphs render
    const tests = ['char-0xE000', 'char-0xE001', 'char-0xE002', 'char-0xE003'];
    for (const id of tests) {
        const elem = page.locator(`#${id}`);
        await expect(elem).toBeVisible();
    }
    
    console.log('✓ Font v4 test passed');
});
