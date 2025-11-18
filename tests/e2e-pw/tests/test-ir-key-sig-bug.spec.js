import { test, expect } from '@playwright/test';

test('IR tab shows correct key signature after UI change', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Testing IR Tab Key Signature Bug ===\n');

  // Type content
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(500);

  console.log('Step 1: Check initial IR (should have no key signature or inherit default)');

  // Open IR tab first to see initial state
  await page.click('[data-testid="tab-ir"]');
  await page.waitForTimeout(500);

  const initialIR = await page.locator('[data-testid="pane-ir"]').innerText();
  console.log('Initial IR key_signature:', initialIR.match(/"key_signature": "([^"]*)"/)?.[1] || 'null');

  console.log('\nStep 2: Set key signature to F major via UI');

  // Click on key signature display (should open dialog)
  const keySigDisplay = page.locator('#key-signature-display');

  // If display is not visible, we need to set it first
  const isDisplayVisible = await keySigDisplay.isVisible().catch(() => false);

  if (!isDisplayVisible) {
    console.log('Key signature display not visible, using menu instead');

    // Use the key signature button in UI
    // First, let's find what UI elements exist
    await page.evaluate(() => {
      // Call the UI method directly
      window.editor.ui.keySignatureSelector.open('document', null);
    });
  } else {
    await keySigDisplay.click();
  }

  await page.waitForTimeout(300);

  // Click on F major in the circle of fifths
  // The key signature items should have data-key attributes
  const fMajorItem = page.locator('[data-key="F major"]');
  await fMajorItem.click();

  await page.waitForTimeout(500);

  console.log('\nStep 3: Verify WASM document has F major');

  const wasmKeySig = await page.evaluate(() => {
    const doc = window.editor.getDocument();
    return doc.key_signature;
  });

  console.log(`WASM document key_signature: ${wasmKeySig}`);
  expect(wasmKeySig).toBe('F major');

  console.log('\nStep 4: Check IR tab (SHOULD show F major, might show wrong value)');

  // Open IR tab (should already be open, but make sure)
  await page.click('[data-testid="tab-ir"]');
  await page.waitForTimeout(500);

  const irAfterChange = await page.locator('[data-testid="pane-ir"]').innerText();

  // Extract key signature from IR
  const irKeySigMatch = irAfterChange.match(/"key_signature": "([^"]*)"/);
  const irKeySig = irKeySigMatch ? irKeySigMatch[1] : 'null';

  console.log(`IR tab key_signature: ${irKeySig}`);

  if (irKeySig === 'F major') {
    console.log('✅ IR tab shows F major (CORRECT)');
  } else {
    console.log(`❌ IR tab shows ${irKeySig} (BUG - should be F major)`);
  }

  // This is the assertion that should pass but might fail
  expect(irKeySig).toBe('F major');

  console.log('\n=== Test Complete ===\n');
});
