import { test, expect } from '@playwright/test';

test('File > New should update Line menu checkbox to unchecked', async ({ page }) => {
  await page.goto('/');
  
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();
  
  // Type a note and press Enter to create a second line
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('2');
  await page.waitForTimeout(500);
  
  // Open Line menu and toggle "Start New System" on second line
  const lineMenuButton = page.locator('#line-menu-button');
  await lineMenuButton.click();
  await page.waitForTimeout(200);
  
  const startNewSystemItem = page.locator('text=Start new system').first();
  await startNewSystemItem.click();
  await page.waitForTimeout(300);
  
  // Verify menu now shows checked (by opening it again)
  await lineMenuButton.click();
  await page.waitForTimeout(200);
  
  let hasCheckmark = await page.evaluate(() => {
    const item = document.querySelector('[data-action="toggle-new-system"]');
    const checkbox = item?.querySelector('.menu-checkbox');
    return checkbox?.textContent?.includes('✓') || false;
  });
  
  console.log('Before File>New: Start New System has checkmark:', hasCheckmark);
  expect(hasCheckmark).toBe(true);
  
  // Close menu
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  
  // Now create a new document via File > New
  const fileMenuButton = page.locator('#file-menu-button');
  await fileMenuButton.click();
  await page.waitForTimeout(200);
  
  const newMenuItem = page.locator('text=New').first();
  await newMenuItem.click();

  // Wait for document to be created and loaded (async operation)
  await page.waitForTimeout(1000);

  // Open Line menu again to check the checkbox
  await lineMenuButton.click();
  await page.waitForTimeout(300);

  const debugInfo = await page.evaluate(() => {
    const editor = window.editor;
    const cursor = editor?.theDocument?.state?.cursor;
    const currentLine = cursor ? editor.theDocument.lines[cursor.line] : null;

    const item = document.querySelector('[data-action="toggle-new-system"]');
    const checkbox = item?.querySelector('.menu-checkbox');

    return {
      hasCheckmark: checkbox?.textContent?.includes('✓') || false,
      cursorLine: cursor?.line,
      cursorCol: cursor?.col,
      totalLines: editor?.theDocument?.lines?.length,
      currentLineNewSystem: currentLine?.new_system,
      currentLinePartId: currentLine?.part_id,
      currentLineSystemId: currentLine?.system_id
    };
  });

  console.log('After File>New debug info:', debugInfo);
  hasCheckmark = debugInfo.hasCheckmark;
  
  // ASSERTION: Menu should now show UNCHECKED for new document
  expect(hasCheckmark).toBe(false);
});
