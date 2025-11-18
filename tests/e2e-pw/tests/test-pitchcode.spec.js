import { test, expect } from '@playwright/test';

test('Typing "1" should set pitchCode to N1', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for editor to be ready
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Type "1"
  await editor.click();
  await page.keyboard.type('1');
  await page.waitForTimeout(500);

  // Open Document Model tab
  await page.click('[data-testid="tab-docmodel"]');
  await page.waitForTimeout(300);

  // Get the document model text
  const docModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

  console.log('\n=== Document Model ===');
  console.log(docModel);
  console.log('======================\n');

  // Check if pitch_code appears
  expect(docModel).toContain('pitch_code');
});
