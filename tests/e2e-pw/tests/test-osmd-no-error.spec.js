import { test, expect } from '@playwright/test';

test('Type 1 + Enter should not cause OSMD errors', async ({ page }) => {
  const errors = [];
  const warnings = [];
  
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.push(text);
    } else if (text.includes('[OSMD]')) {
      warnings.push(text);
    }
  });
  
  await page.goto('/');
  
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();
  
  // Type "1" and press Enter
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  
  // Check for OSMD/MusicSheetReader errors
  const osmsdErrors = errors.filter(e => 
    e.includes('MusicSheetReader') || 
    e.includes('realValue') ||
    e.includes('opensheetmusicdisplay')
  );
  
  console.log('Total errors:', errors.length);
  console.log('OSMD errors:', osmsdErrors.length);
  
  if (osmsdErrors.length > 0) {
    console.log('OSMD errors found:', osmsdErrors);
  }
  
  expect(osmsdErrors.length).toBe(0);
});
