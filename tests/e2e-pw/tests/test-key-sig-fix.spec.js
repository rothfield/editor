import { test, expect } from '@playwright/test';

test('Key signature should save correctly after fix', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Testing Key Signature Save Fix ===\n');

  // Type content
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  console.log('Step 1: Set key signature via JavaScript (simulating UI action)');

  // This simulates what the UI does when you select a key
  await page.evaluate(() => {
    const doc = window.editor.getDocument();
    doc.key_signature = 'G major';
    window.editor.wasmModule.loadDocument(doc);
  });

  await page.waitForTimeout(300);

  console.log('Step 2: Verify key signature persisted in WASM');

  // Get a FRESH snapshot from WASM to verify it was saved
  const keySig = await page.evaluate(() => {
    const freshDoc = window.editor.getDocument();
    return freshDoc.key_signature;
  });

  console.log(`Key signature from WASM: ${keySig}`);

  if (keySig === 'G major') {
    console.log('✅ Key signature saved correctly!');
  } else {
    console.log(`❌ Key signature not saved. Got: ${keySig}`);
  }

  expect(keySig).toBe('G major');

  console.log('\nStep 3: Verify it appears in Persistent Model tab');

  await page.click('[data-testid="tab-docmodel"]');
  await page.waitForTimeout(300);

  const docModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

  expect(docModel).toContain('key_signature:');
  expect(docModel).toContain('G major');

  console.log('✅ Key signature appears in Persistent Model');
  console.log('\n=== Test Passed! ===\n');
});
