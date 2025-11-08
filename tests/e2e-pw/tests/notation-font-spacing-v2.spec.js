import { test, expect } from '@playwright/test';

test('Notation font - dramatically improved dot spacing', async ({ page }) => {
    // Clear cache and reload
    await page.context().clearCookies();
    
    await page.goto('http://localhost:8080/test-notation-font-minimal.html', {
        waitUntil: 'networkidle',
        referer: 'http://localhost:8080/'
    });
    
    // Force wait for font loading
    await page.waitForTimeout(1500);
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/font-spacing-v2.png', fullPage: true });
    
    console.log('✓ Updated screenshot with dramatic spacing saved');
});
