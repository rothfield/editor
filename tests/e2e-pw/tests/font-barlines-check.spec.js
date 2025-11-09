import { test } from '@playwright/test';

test('Check barline codepoints in Font Test', async ({ page }) => {
  console.log('=== Checking Font Test Barline Codepoints ===\n');
  
  // Visit app
  await page.goto('http://localhost:8080', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  
  // Click Font Test tab (button 14)
  const buttons = await page.locator('button').all();
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes('Font Test')) {
      await btn.click();
      await page.waitForTimeout(500);
      break;
    }
  }
  
  // Click "Barlines & Symbols" button
  const actionButtons = page.locator('button');
  const count = await actionButtons.count();
  
  for (let i = 0; i < count; i++) {
    const btn = actionButtons.nth(i);
    const text = await btn.textContent();
    if (text && (text.includes('Barlines') || text.includes('Symbols'))) {
      console.log(`Found Barlines button, clicking...`);
      await btn.click();
      await page.waitForTimeout(1000);
      break;
    }
  }
  
  // Screenshot
  await page.screenshot({ path: '/tmp/font_test_barlines.png', fullPage: true });
  
  // Get all glyph items and extract barline info
  const glyphItems = page.locator('.font-test-glyph-item');
  const itemCount = await glyphItems.count();
  console.log(`Found ${itemCount} glyph items\n`);
  
  // Extract barline data
  const barlines = [];
  for (let i = 0; i < itemCount; i++) {
    const item = glyphItems.nth(i);
    const labelEl = item.locator('.font-test-glyph-label');
    const cpEl = item.locator('.font-test-glyph-codepoint');
    
    const label = await labelEl.textContent();
    const cp = await cpEl.textContent();
    
    if (label && (label.includes('Barline') || label.includes('Repeat') || label.includes('barline'))) {
      console.log(`Found barline: "${label}" → ${cp}`);
      barlines.push({ label, codepoint: cp });
    }
  }
  
  // Verify expected barlines
  console.log('\n=== SMuFL Compliance Check ===');
  const expected = [
    { name: 'Single Barline', expected: 'U+E030' },
    { name: 'Double Barline', expected: 'U+E031' },
    { name: 'Repeat Left', expected: 'U+E040' },
    { name: 'Repeat Right', expected: 'U+E041' },
    { name: 'Repeat Both', expected: 'U+E042' },
  ];
  
  for (const exp of expected) {
    const found = barlines.find(b => b.label.includes(exp.name) && b.codepoint === exp.expected);
    const status = found ? '✓' : '✗';
    console.log(`${status} ${exp.name}: ${exp.expected}`);
  }
});
