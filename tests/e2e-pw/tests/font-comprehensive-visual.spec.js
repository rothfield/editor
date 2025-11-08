import { test, expect } from '@playwright/test';

test('Visual test: Complex notation with octaves, accidentals, barlines', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  // Wait for editor
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  
  // Click in editor
  await editor.click();
  
  // Type complex notation with multiple features:
  // | = barline, - = duration extension, # = sharp accidental
  // Octaves shown with vertical positioning in notation
  await page.keyboard.type('| 1-- 2# 3-\u2022 4 | 5 6b 7 |');
  
  // Wait for rendering
  await page.waitForTimeout(1500);
  
  // Take screenshot showing complex notation
  await page.screenshot({ path: 'test-results/font-comprehensive.png', fullPage: true });
  
  console.log('✓ Complex notation test completed');
});

test('Visual test: Octave variants with extended durations', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  
  await editor.click();
  
  // Test octave shifts: dashes extend duration which creates octave markers
  await page.keyboard.type('1 1- 1-- 1---');
  
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/font-octaves.png', fullPage: true });
  
  console.log('✓ Octave variants test completed');
});

test('Visual test: All pitch systems with notation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  
  await editor.click();
  
  // Type notation that works across systems
  await page.keyboard.type('1 2 3 4 5 6 7');
  
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/font-all-systems.png', fullPage: true });
  
  console.log('✓ All systems test completed');
});

test('Visual test: Accidentals and special characters', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  
  const editor = page.locator('[role="textbox"]').first();
  await expect(editor).toBeVisible({ timeout: 10000 });
  
  await editor.click();
  
  // Test with accidentals
  await page.keyboard.type('1# 2# 3# 4# 5# 6# 7#');
  
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/font-accidentals.png', fullPage: true });
  
  console.log('✓ Accidentals test completed');
});
