import { test, expect } from '@playwright/test';

test('setTitle should update the document title', async ({ page }) => {
  await page.goto('/');
  
  // Wait for editor to be ready
  await page.waitForSelector('#notation-editor');

  // Listen for console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Error]: ${msg.text()}`);
    }
  });

  // Mock window.prompt to return "My New Title"
  await page.evaluate(() => {
    window.prompt = () => "My New Title";
  });

  // Click File menu
  await page.click('#file-menu-button');
  
  // Click Set Title
  await page.click('#menu-set-title');

  // Verify the title in the UI
  const titleElement = page.locator('#composition-title');
  await expect(titleElement).toHaveText('My New Title');

  // Verify internal document state via console/wasm
  // We can check if the title persisted by triggering another action or checking via evaluate
  const docTitle = await page.evaluate(() => {
    return window.editor.getDocument().title;
  });
  
  expect(docTitle).toBe('My New Title');
});
