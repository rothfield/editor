import { test, expect } from '@playwright/test';

test('Key signature display updates automatically', async ({ page }) => {
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(text);
    if (text.includes('[WASMBridge]') || text.includes('key signature') || text.includes('SVG')) {
      console.log(`[BROWSER] ${text}`);
    }
  });

  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Testing Key Signature Display Update ===\n');

  // Type content
  await editor.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(300);

  console.log('Step 1: Set key signature to G major via WASM');

  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentKeySignature('G major');
  });

  // Wait for automatic redraw
  await page.waitForTimeout(800);

  // Debug: Check what the document key signature is
  const docKeySig = await page.evaluate(() => {
    const doc = window.editor.getDocument();
    return doc.key_signature;
  });
  console.log(`Document key_signature: ${docKeySig}`);

  // Debug: Check display element classes
  const displayClasses = await page.evaluate(() => {
    const el = document.getElementById('key-signature-display');
    return el ? el.className : 'element not found';
  });
  console.log(`Display element classes: ${displayClasses}`);

  // Check if key signature display is visible and shows G major
  const keySigDisplay = page.locator('#key-signature-display');

  if (await keySigDisplay.isHidden()) {
    console.log('❌ Key signature display is still hidden');
  }

  await expect(keySigDisplay).toBeVisible();

  const svgElement = page.locator('#key-sig-display-svg');
  const svgSrc = await svgElement.getAttribute('src');
  console.log(`Key signature display SVG: ${svgSrc}`);

  // Should show G major SVG
  expect(svgSrc).toContain('G-major');

  console.log('✅ Key signature display shows G major');

  console.log('\nStep 2: Change to F major');

  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentKeySignature('F major');
  });

  // Wait for automatic redraw
  await page.waitForTimeout(500);

  const svgSrc2 = await svgElement.getAttribute('src');
  console.log(`Key signature display SVG after change: ${svgSrc2}`);

  // Should show F major SVG
  expect(svgSrc2).toContain('F-major');

  console.log('✅ Key signature display updated to F major');

  console.log('\n=== Test Complete ===\n');
});
