import { test, expect } from '@playwright/test';

test('Notation font - MASSIVE spacing test', async ({ page }) => {
    await page.goto('http://localhost:8080/test-notation-font-minimal.html?t=' + Date.now() + Math.random(), {
        waitUntil: 'networkidle'
    });
    
    // Hard wait for font rendering
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'test-results/font-massive-spacing.png', fullPage: true });
    
    console.log('✓ Massive spacing screenshot');
});
