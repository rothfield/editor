import { test, expect } from '@playwright/test';

test.describe('Tonic and Key Signature Independence', () => {
  test('Tonic and key_signature are independent fields', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Set tonic to E
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('E');
    });

    // Separately set key_signature to something different (E minor, not E major)
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentKeySignature('E minor');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    // Get the document to check both values
    const doc = await page.evaluate(() => window.editor.getDocument());
    console.log('Document state:', { tonic: doc.tonic, key_signature: doc.key_signature });

    expect(doc.tonic).toBe('E');
    expect(doc.key_signature).toBe('E minor');
    expect(doc.tonic).not.toBe(doc.key_signature); // They should be independent

    console.log('✅ Tonic (E) and key_signature (E minor) are independent');
  });

  test('Setting tonic does NOT change key_signature', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('2 3 4');

    // Set key_signature first to G minor
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentKeySignature('G minor');
    });

    // Then set tonic to E
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('E');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    // Get the document to verify key_signature was not changed
    const doc = await page.evaluate(() => window.editor.getDocument());
    console.log('After setting tonic, document state:', { tonic: doc.tonic, key_signature: doc.key_signature });

    expect(doc.tonic).toBe('E');
    expect(doc.key_signature).toBe('G minor', 'key_signature should NOT be changed when setting tonic');

    console.log('✅ Setting tonic to E does NOT change key_signature (still G minor)');
  });

  test('Key signature can be set independently', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Set tonic to C
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('C');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    // Now change key_signature to D major (different from tonic)
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentKeySignature('D major');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    const doc = await page.evaluate(() => window.editor.getDocument());
    console.log('After setting key_signature, document state:', { tonic: doc.tonic, key_signature: doc.key_signature });

    expect(doc.tonic).toBe('C');
    expect(doc.key_signature).toBe('D major');

    console.log('✅ Key signature can be set independently to different value than tonic');
  });

  test('Tonic persists independently of key_signature', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('3 4 5');

    // Set both fields
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('F');
      window.editor.wasmModule.setDocumentKeySignature('Bb major');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    // Change key_signature
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentKeySignature('F major');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    const doc = await page.evaluate(() => window.editor.getDocument());

    // Tonic should remain unchanged
    expect(doc.tonic).toBe('F', 'tonic should persist when key_signature changes');
    expect(doc.key_signature).toBe('F major');

    console.log('✅ Tonic (F) persists independently when key_signature changes');
  });
});
