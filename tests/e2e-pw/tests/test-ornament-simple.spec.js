import { test, expect } from '@playwright/test';

test('ornament: simple Ctrl+O test', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type some content
  await page.keyboard.type('4');
  await page.waitForTimeout(200);

  // Check initial mode display
  const modeIndicator = page.locator('text=Edit Ornament Mode');
  await expect(modeIndicator).toBeVisible();
  let modeText = await modeIndicator.textContent();
  console.log('Mode before Ctrl+O:', modeText);
  expect(modeText).toContain('OFF');

  // Try Ctrl+O to enter ornament mode
  console.log('\nPressing Ctrl+O...');
  await page.keyboard.press('Control+O');
  await page.waitForTimeout(500);

  // Check mode display after Ctrl+O
  modeText = await modeIndicator.textContent();
  console.log('Mode after Ctrl+O:', modeText);

  if (modeText.includes('ON')) {
    console.log('✓ Ornament mode is ON');
  } else {
    console.log('✗ Ornament mode is still OFF');
  }

  expect(modeText).toContain('ON');
});
