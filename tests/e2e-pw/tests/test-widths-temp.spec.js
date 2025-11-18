import { test } from '@playwright/test';

test('Check "1 2" widths in display list', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await editor.click();
  await page.keyboard.type('1 2');
  await page.waitForTimeout(1000);

  await page.click('[data-testid="tab-displaylist"]');
  await page.waitForTimeout(300);
  const displayList = await page.locator('[data-testid="pane-displaylist"]').innerText();

  console.log('\n=== DISPLAY LIST FOR "1 2" ===');
  console.log(displayList.substring(0, 1200));
});
