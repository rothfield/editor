import { test, expect } from '@playwright/test';

test('Type 1 + Enter should export valid MusicXML with part_id', async ({ page }) => {
  await page.goto('/');
  
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();
  
  // Type "1" and press Enter
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  
  // Get MusicXML tab
  const musicxmlTab = page.getByTestId('tab-musicxml');
  await expect(musicxmlTab).toBeVisible();
  await musicxmlTab.click();
  
  // Wait for MusicXML to render
  await page.waitForTimeout(500);
  
  // Get MusicXML content
  const musicxmlPane = page.getByTestId('pane-musicxml');
  const musicxml = await musicxmlPane.innerText();
  
  console.log('MusicXML output:', musicxml);
  
  // Verify correct part structure
  expect(musicxml).not.toContain('id=""'); // No empty part IDs
  expect(musicxml).toContain('id="P1"'); // Has P1 part
  expect(musicxml).not.toContain('id="P2"'); // Should NOT have P2 (lines combined into one part)
});
