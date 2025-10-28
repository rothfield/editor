import { test, expect } from '@playwright/test';

test('verify selection display after shift+left', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "hello"
  await page.keyboard.type('hello');
  await page.waitForTimeout(200);

  // Get selection info before selecting
  let selectionInfo = await page.locator('#selection-info').innerText();
  console.log(`Before selection: "${selectionInfo}"`);

  // Press Shift+Left 3 times to select "llo"
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(50);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(50);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  // Get selection info after selecting
  selectionInfo = await page.locator('#selection-info').innerText();
  console.log(`After selecting "llo": "${selectionInfo}"`);

  // Verify the display
  expect(selectionInfo).toContain('Selected: 3 cells');
  expect(selectionInfo).toContain('llo');
});
