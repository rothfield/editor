import { test, expect } from '@playwright/test';

test('Key signature uses WASM API (no document mutation)', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Testing WASM-First Key Signature API ===\n');

  // Type content
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  console.log('Step 1: Set key signature via WASM API');

  // Call the WASM function directly (as the UI now does)
  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentKeySignature('F major');
  });

  await page.waitForTimeout(300);

  console.log('Step 2: Verify key signature persisted in WASM');

  // Get a FRESH snapshot from WASM
  const keySig = await page.evaluate(() => {
    const doc = window.editor.getDocument();
    return doc.key_signature;
  });

  console.log(`Key signature from WASM: ${keySig}`);

  if (keySig === 'F major') {
    console.log('✅ Key signature saved correctly via WASM API!');
  } else {
    console.log(`❌ Expected 'F major', got: ${keySig}`);
  }

  expect(keySig).toBe('F major');

  console.log('\nStep 3: Verify key signature in IR export');

  // Open IR tab
  await page.click('[data-testid="tab-ir"]');
  await page.waitForTimeout(500);

  const irText = await page.locator('[data-testid="pane-ir"]').innerText();
  console.log('IR excerpt:', irText.substring(0, 500));

  // Check if IR contains "F major" key signature
  if (irText.includes('"key_signature": "F major"') || irText.includes("'F major'")) {
    console.log('✅ IR export shows F major!');
  } else if (irText.includes('"key_signature": "C major"') || irText.includes("'C major'")) {
    console.log('❌ IR export shows C major (BUG)');
  } else if (irText.includes('"key_signature": null')) {
    console.log('❌ IR export shows null key signature (BUG)');
  } else {
    console.log('⚠️ Could not find key_signature in IR');
  }

  // Should contain F major
  expect(irText).toContain('F major');

  console.log('\nStep 4: Test line-level key signature');

  await page.evaluate(() => {
    window.editor.wasmModule.setLineKeySignature(0, 'E minor');
  });

  await page.waitForTimeout(300);

  const lineKeySig = await page.evaluate(() => {
    const doc = window.editor.getDocument();
    return doc.lines[0]?.key_signature;
  });

  console.log(`Line 0 key signature: ${lineKeySig}`);

  expect(lineKeySig).toBe('E minor');

  console.log('✅ Line key signature saved correctly via WASM API!');

  console.log('\nStep 5: Verify in Persistent Model tab');

  await page.click('[data-testid="tab-docmodel"]');
  await page.waitForTimeout(300);

  const docModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

  // Should have both document-level and line-level key signatures
  expect(docModel).toContain('F major');
  expect(docModel).toContain('E minor');

  console.log('✅ Both key signatures appear in Persistent Model');
  console.log('\n=== All Tests Passed! WASM-First Architecture Working ===\n');
});
