import { test, expect } from '@playwright/test';

test('Navigate to Font Test tab and display all glyphs', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  await page.waitForTimeout(2000);
  
  // Look for inspector tabs - they appear to be icons on the right side
  // Try to find tabs by looking for elements with specific patterns
  
  // The tabs seem to be buttons. Let's look for all clickable elements in the right panel
  const rightPanel = page.locator('div').filter({ hasText: /🎵|Font|Test/ }).first();
  
  // Try clicking on different tabs - look for button-like elements in right area
  // Based on the screenshot, there appear to be icon buttons
  
  // Get all buttons and find ones in right area
  const buttons = page.locator('button');
  console.log('Searching for Font Test tab...');
  
  // Try different approaches
  // 1. Look for text "Font"
  let fontBtn = page.locator('text=Font').first();
  if (await fontBtn.count() > 0) {
    console.log('Found Font button');
    await fontBtn.click();
  }
  
  // 2. Look in Edit menu
  let editBtn = page.locator('button:has-text("Edit")').first();
  if (await editBtn.isVisible()) {
    console.log('Clicking Edit menu');
    await editBtn.click();
    await page.waitForTimeout(500);
    
    // Look for menu items
    const menuItems = page.locator('[role="menuitem"]');
    const menuCount = await menuItems.count();
    console.log(`Found ${menuCount} menu items`);
    
    for (let i = 0; i < menuCount; i++) {
      const text = await menuItems.nth(i).textContent();
      console.log(`  Menu ${i}: "${text}"`);
      if (text.includes('Font')) {
        console.log('Found Font in menu');
        await menuItems.nth(i).click();
        break;
      }
    }
  }
  
  await page.waitForTimeout(1000);
  
  // Take screenshot to see result
  await page.screenshot({ path: 'test-results/font-test-tab.png', fullPage: true });
  console.log('Screenshot captured');
});
