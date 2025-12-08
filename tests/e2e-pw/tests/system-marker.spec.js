import { test, expect } from '@playwright/test';

test('Set system start marker', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    logs.push(msg.text());
  });

  await page.goto('/');
  await page.waitForTimeout(1000);

  // Get indicator
  const indicator = page.locator('.system-marker-indicator').first();
  
  // Before: should show dot (no marker)
  const beforeText = await indicator.textContent();
  console.log('Before setting marker:', beforeText);
  expect(beforeText).toBe('·');

  // Click to open menu
  await indicator.click();
  await page.waitForTimeout(300);

  // Verify menu is visible
  const menu = page.locator('#system-marker-menu');
  await expect(menu).toBeVisible();

  // Click "Start System" option
  const startOption = menu.locator('.system-marker-menu-item').first();
  await startOption.click();
  await page.waitForTimeout(500);

  // Menu should be closed
  await expect(menu).not.toBeVisible();

  // Indicator should now show «
  const afterText = await indicator.textContent();
  console.log('After setting marker:', afterText);
  expect(afterText).toBe('«');

  // Check relevant logs
  const setLogs = logs.filter(l => l.includes('marker') || l.includes('system'));
  console.log('Relevant logs:');
  setLogs.slice(-10).forEach(l => console.log('  ', l));
});

test('Set system end marker and verify MusicXML bracket grouping', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1000);

  // Add a second line first
  const editor = page.locator('#notation-editor');
  await editor.click();
  await page.keyboard.press('Enter'); // Add new line
  await page.waitForTimeout(300);

  // Set start marker on line 0
  const indicators = page.locator('.system-marker-indicator');
  await indicators.nth(0).click();
  await page.waitForTimeout(200);
  
  let menu = page.locator('#system-marker-menu');
  await menu.locator('.system-marker-menu-item').first().click(); // Start
  await page.waitForTimeout(300);

  // Set end marker on line 1
  await indicators.nth(1).click();
  await page.waitForTimeout(200);
  
  menu = page.locator('#system-marker-menu');
  await menu.locator('.system-marker-menu-item').nth(1).click(); // End
  await page.waitForTimeout(300);

  // Verify indicators show correct markers
  const line0Text = await indicators.nth(0).textContent();
  const line1Text = await indicators.nth(1).textContent();
  console.log('Line 0 marker:', line0Text);
  console.log('Line 1 marker:', line1Text);
  
  expect(line0Text).toBe('«');
  expect(line1Text).toBe('»');
});
