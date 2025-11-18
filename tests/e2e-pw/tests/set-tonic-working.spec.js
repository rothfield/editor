import { test, expect } from '@playwright/test';

test.describe('Set Tonic - WASM Functions Work', () => {
  test('Document tonic can be set via WASM function', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type some musical content
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    // Call the WASM function directly via console
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('C');
    });

    // View the WASM document model
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);

    const model = await page.locator('[data-testid="pane-docmodel"]').innerText();

    // Find the document-level tonic field
    const tonicLine = model.split('\n').find(line => line.trim().startsWith('tonic:'));

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║        SET TONIC VERIFICATION                        ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log('Document model tonic line:', tonicLine);
    console.log('\n✅ EXPECTED BEHAVIOR:');
    console.log('   • Document tonic field should now be "C"');
    console.log('   • WASM function successfully persisted the value');

    // Verify the fix: tonic should now be "C" (not null)
    expect(tonicLine).toContain('tonic: "C"');
    expect(tonicLine).not.toContain('tonic: null');
  });

  test('Line tonic can be set via WASM function', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type content to create a line
    await editor.click();
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    // Call the WASM function directly via console
    await page.evaluate(() => {
      window.editor.wasmModule.setLineTonic(0, 'G');
    });

    // View document model
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);

    const model = await page.locator('[data-testid="pane-docmodel"]').innerText();

    // Find the line tonic field in the first line
    const linesMatch = model.match(/lines:\s*-[\s\S]*?tonic:\s*\"?([^\s\"]*)\"?/);
    const lineTonic = linesMatch ? linesMatch[1] : 'NOT_FOUND';

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║        LINE TONIC VERIFICATION                       ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log('Line tonic value:', `"${lineTonic}"`);
    console.log('\n✅ EXPECTED BEHAVIOR:');
    console.log('   • Line tonic field should now be "G"');
    console.log('   • WASM function successfully persisted the value');

    // Verify: line tonic should be "G" (not empty string)
    expect(lineTonic).toBe('G');
  });
});
