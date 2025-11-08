import { test, expect } from '@playwright/test';

test('Notation font - adjusted dot spacing', async ({ page }) => {
    await page.goto('http://localhost:8080/test-notation-font-minimal.html?t=' + Date.now() + Math.random(), {
        waitUntil: 'networkidle'
    });
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/font-adjusted-spacing.png', fullPage: true });
    
    console.log('✓ Adjusted spacing screenshot');
});
