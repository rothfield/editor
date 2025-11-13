import { test, expect } from '@playwright/test';

test('DEBUG: check space cell DOM structure', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "1 2"
  await page.keyboard.type('1 2');
  await page.waitForTimeout(200);

  // Get the whitespace cell container
  const spaceCellContainer = page.locator('.cell-container').nth(1);
  await expect(spaceCellContainer).toBeVisible();

  // Check the inline style
  const style = await spaceCellContainer.getAttribute('style');
  console.log(`Space cell-container style: ${style}`);

  // Check computed width
  const width = await spaceCellContainer.evaluate(el => window.getComputedStyle(el).width);
  console.log(`Space cell-container computed width: ${width}`);

  // Check the actual cell content
  const cellContent = spaceCellContainer.locator('.char-cell');
  const contentText = await cellContent.textContent();
  console.log(`Space cell content text: "${contentText}"`);

  const contentStyle = await cellContent.getAttribute('style');
  console.log(`Space cell content style: ${contentStyle}`);
});
