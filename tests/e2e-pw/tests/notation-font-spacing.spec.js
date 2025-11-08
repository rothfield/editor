import { test, expect } from '@playwright/test';

test('Notation font - improved dot spacing verification', async ({ page }) => {
    await page.goto('http://localhost:8080/test-notation-font-minimal.html');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    
    // Take fresh screenshot with improved spacing
    await page.screenshot({ path: 'test-results/font-improved-spacing.png', fullPage: true });
    
    console.log('✓ Screenshot with improved spacing saved');
});
