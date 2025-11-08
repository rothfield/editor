import { test, expect } from '@playwright/test';

test('Full notation font demo renders all systems correctly', async ({ page }) => {
    await page.goto('http://localhost:8080/test-notation-font.html');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Font rendering
    
    // Check success message
    const success = page.locator('text=successfully loaded').first();
    await expect(success).toBeVisible();
    
    // Check all system cards are visible
    const cards = page.locator('.system-card');
    const count = await cards.count();
    expect(count).toBe(4); // 4 notation systems
    
    console.log(`✓ All ${count} notation system cards rendered`);
    
    // Take full screenshot
    await page.screenshot({ path: 'test-results/font-full-demo.png', fullPage: true });
    console.log('✓ Full demo screenshot saved');
});
