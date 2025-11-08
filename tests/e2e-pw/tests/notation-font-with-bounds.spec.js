import { test, expect } from '@playwright/test';

test('Notation font - with expanded bounds', async ({ page }) => {
    await page.goto('http://localhost:8080/test-notation-font-minimal.html?t=' + Date.now(), {
        waitUntil: 'networkidle'
    });
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/font-with-bounds.png', fullPage: true });
    
    console.log('✓ Screenshot with expanded bounds taken');
});
