import { test, expect } from '@playwright/test';

test('Key signature should persist in document model', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Step 1: Type some content ===');
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(500);

  console.log('\n=== Step 2: Open key signature selector ===');
  // Click the key signature corner display to open selector
  const keyDisplay = page.locator('#key-sig-corner-display');
  await keyDisplay.click();
  await page.waitForTimeout(300);

  // Verify modal opened
  const modal = page.locator('#key-signature-modal');
  await expect(modal).not.toHaveClass(/hidden/);

  console.log('\n=== Step 3: Select D major ===');
  // Click on D major (2 sharps)
  const dMajorItem = page.locator('.key-sig-item[data-key="D major"]');
  await dMajorItem.click();
  await page.waitForTimeout(500);

  console.log('\n=== Step 4: Check persistent model ===');
  // Open Document Model tab
  await page.click('[data-testid="tab-docmodel"]');
  await page.waitForTimeout(300);

  // Get the document model text
  const docModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

  console.log('\n--- Document Model Output ---');
  // Find and display the key_signature field
  const lines = docModel.split('\n');
  const keySigLine = lines.find(line => line.includes('key_signature:'));
  console.log('Key signature line:', keySigLine || 'NOT FOUND');
  console.log('----------------------------\n');

  // Check if key_signature is set to "D major"
  expect(docModel).toContain('key_signature:');
  expect(docModel).toContain('D major');

  console.log('✅ Key signature successfully saved!');
});
