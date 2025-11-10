import { test, expect } from '@playwright/test';

test('New composition should show Start New System menu item as UNCHECKED', async ({ page }) => {
  await page.goto('/');
  
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  
  // Wait for editor to initialize
  await page.waitForTimeout(500);
  
  // Type a note to ensure editor is active
  await editor.click();
  await page.keyboard.type('1');
  await page.waitForTimeout(300);
  
  // Open the Line menu
  const lineMenu = page.locator('text=Line').first();
  await lineMenu.click();
  await page.waitForTimeout(200);
  
  // Find the "Start New System" menu item
  const startNewSystemItem = page.locator('text=Start New System').first();
  await expect(startNewSystemItem).toBeVisible();
  
  // Check if it has a checkmark (various possible selectors)
  const parentItem = startNewSystemItem.locator('..');
  
  // Try to find a checkmark indicator (✓, ✔, or checked class/attribute)
  const hasCheckmark = await page.evaluate((element) => {
    // Check for various checkmark indicators
    const text = element.textContent || '';
    const hasCheckSymbol = text.includes('✓') || text.includes('✔') || text.includes('☑');
    const hasCheckedClass = element.classList.contains('checked') || 
                           element.classList.contains('active') ||
                           element.hasAttribute('aria-checked');
    const checkedAttr = element.getAttribute('aria-checked') === 'true';
    
    console.log('Menu item text:', text);
    console.log('Has check symbol:', hasCheckSymbol);
    console.log('Has checked class:', hasCheckedClass);
    console.log('aria-checked:', element.getAttribute('aria-checked'));
    
    return hasCheckSymbol || hasCheckedClass || checkedAttr;
  }, await parentItem.elementHandle());
  
  console.log('Start New System menu item has checkmark:', hasCheckmark);
  
  // ASSERTION: Menu item should NOT be checked for first line in new composition
  expect(hasCheckmark).toBe(false);
});
