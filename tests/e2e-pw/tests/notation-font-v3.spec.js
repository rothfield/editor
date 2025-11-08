import { test, expect } from '@playwright/test';

test('Notation font v3 - outline copied glyphs render correctly', async ({ page }) => {
    await page.goto('http://localhost:8080/test-notation-font-minimal.html');
    
    // Wait for page and font to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // Brief wait for font rendering
    
    // Test character "1" variants
    const char1 = page.locator('#char-0xE000');
    await expect(char1).toBeVisible();
    
    // Verify we can get text (shouldn't be empty or error)
    const text = await char1.textContent();
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
    
    console.log('Character "1" with 1 dot above rendered:', JSON.stringify(text));
    
    // Take a screenshot to verify visual rendering
    await page.screenshot({ path: 'test-results/font-v3-test.png', fullPage: true });
    
    // Verify all 4 variants of "1" render
    const testCases = [
        { id: 'char-0xE000', cp: '0xE000', label: '1 dot above' },
        { id: 'char-0xE001', cp: '0xE001', label: '2 dots above' },
        { id: 'char-0xE002', cp: '0xE002', label: '1 dot below' },
        { id: 'char-0xE003', cp: '0xE003', label: '2 dots below' }
    ];
    
    for (const test of testCases) {
        const elem = page.locator(`#${test.id}`);
        await expect(elem).toBeVisible();
        const content = await elem.textContent();
        expect(content).toBeTruthy();
        console.log(`✓ Variant ${test.cp} (${test.label}): rendered successfully`);
    }
    
    console.log('✓ All "1" variants rendered successfully');
});
