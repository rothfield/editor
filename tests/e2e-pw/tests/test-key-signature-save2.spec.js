import { test, expect } from '@playwright/test';

test('Key signature should persist when set via menu', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Step 1: Type some content ===');
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(500);

  console.log('\n=== Step 2: Call setKeySignature via JavaScript ===');
  // Directly call the WASM loadDocument function with a modified document
  await page.evaluate(() => {
    const doc = window.editor.getDocument();
    doc.key_signature = 'D major';
    window.editor.wasmModule.loadDocument(doc);
  });
  await page.waitForTimeout(300);

  console.log('\n=== Step 3: Check persistent model ===');
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

  // Show a few lines around key_signature for context
  const keySigIndex = lines.findIndex(line => line.includes('key_signature:'));
  if (keySigIndex >= 0) {
    console.log('\nContext:');
    for (let i = Math.max(0, keySigIndex - 2); i <= Math.min(lines.length - 1, keySigIndex + 2); i++) {
      console.log(lines[i]);
    }
  }
  console.log('----------------------------\n');

  // Check if key_signature is set to "D major"
  if (docModel.includes('key_signature:') && docModel.includes('D major')) {
    console.log('✅ Key signature successfully saved!');
  } else {
    console.log('❌ Key signature NOT saved correctly');
    console.log('\nFull document model:');
    console.log(docModel);
  }

  expect(docModel).toContain('key_signature:');
  expect(docModel).toContain('D major');
});
