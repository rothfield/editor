import { test, expect } from '@playwright/test';

test('IR tab updates when key signature is CHANGED', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Testing IR Tab Key Signature CHANGE ===\n');

  // Type content
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(500);

  console.log('Step 1: Set key signature to G major');

  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentKeySignature('G major');
    // Trigger export update (this is what the UI does)
    window.editor.forceUpdateAllExports();
  });

  await page.waitForTimeout(500);

  // Open IR tab
  await page.click('[data-testid="tab-ir"]');
  await page.waitForTimeout(500);

  const ir1 = await page.locator('[data-testid="pane-ir"]').innerText();
  const keySig1 = ir1.match(/"key_signature": "([^"]*)"/)?.[1] || 'null';
  console.log(`IR after setting G major: ${keySig1}`);
  expect(keySig1).toBe('G major');

  console.log('\nStep 2: CHANGE key signature to F major');

  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentKeySignature('F major');
    // No need to manually call forceUpdateAllExports() - automatic redraw handles it
  });

  await page.waitForTimeout(500); // Wait for automatic redraw

  console.log('\nStep 3: Check if IR tab updated (should update automatically)');

  // Re-read IR tab WITHOUT switching tabs (should be stale)
  const ir2 = await page.locator('[data-testid="pane-ir"]').innerText();
  const keySig2 = ir2.match(/"key_signature": "([^"]*)"/)?.[1] || 'null';

  console.log(`IR after changing to F major: ${keySig2}`);

  if (keySig2 === 'F major') {
    console.log('✅ IR tab updated correctly');
  } else {
    console.log(`❌ IR tab still shows ${keySig2} (BUG - should be F major)`);
  }

  expect(keySig2).toBe('F major');

  console.log('\nStep 4: Manually refresh IR tab and check again');

  // Click away and back to IR tab to force refresh
  await page.click('[data-testid="tab-docmodel"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="tab-ir"]');
  await page.waitForTimeout(500);

  const ir3 = await page.locator('[data-testid="pane-ir"]').innerText();
  const keySig3 = ir3.match(/"key_signature": "([^"]*)"/)?.[1] || 'null';

  console.log(`IR after manual refresh: ${keySig3}`);
  expect(keySig3).toBe('F major');

  console.log('\n=== Test Complete ===\n');
});
