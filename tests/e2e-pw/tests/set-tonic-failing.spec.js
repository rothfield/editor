import { test, expect } from '@playwright/test';

test.describe('Set Tonic Bug - FAILING TEST', () => {
  test('BUG: tonic field is always null - no WASM function to set it', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type some musical content
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    // View the WASM document model
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);

    const model = await page.locator('[data-testid="pane-docmodel"]').innerText();

    // Find the document-level tonic field
    const tonicLine = model.split('\n').find(line => line.trim().startsWith('tonic:'));

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║        SET TONIC BUG DEMONSTRATION                   ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log('Document model tonic line:', tonicLine);
    console.log('\n📋 OBSERVED BEHAVIOR:');
    console.log('   • Document has a "tonic" field in the model');
    console.log('   • The value is ALWAYS null');
    console.log('   • UI has "File > Set Tonic..." menu item');
    console.log('   • Clicking it shows a prompt but has no effect');

    console.log('\n🐛 ROOT CAUSE:');
    console.log('   • No WASM function exists to set document tonic');
    console.log('   • JavaScript UI.setTonic() sets doc.tonic on JS object');
    console.log('   • But this change is never synced to WASM document');
    console.log('   • When doc model is serialized, tonic is still null');

    console.log('\n✅ REQUIRED FIX:');
    console.log('   1. Add WASM function: setDocumentTonic(tonic: String)');
    console.log('   2. Add WASM function: setLineTonic(line_idx: usize, tonic: String)');
    console.log('   3. Update ui.js to call WASM functions instead of JS assignment');

    console.log('\n📁 FILES TO MODIFY:');
    console.log('   • src/api/core.rs - add #[wasm_bindgen] functions');
    console.log('   • src/js/editor.js - expose functions in this.wasmModule');
    console.log('   • src/js/ui.js - call this.editor.wasmModule.setDocumentTonic()');

    // Verify the bug: tonic is null
    expect(tonicLine).toContain('tonic: null');
  });

  test('BUG: line tonic field is always empty string', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type content to create a line
    await editor.click();
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    // View document model
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);

    const model = await page.locator('[data-testid="pane-docmodel"]').innerText();

    // Find the line tonic field in the first line
    const linesMatch = model.match(/lines:\s*-[\s\S]*?tonic:\s*"([^"]*)"/);
    const lineTonic = linesMatch ? linesMatch[1] : 'NOT_FOUND';

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║        LINE TONIC BUG DEMONSTRATION                  ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log('Line tonic value:', `"${lineTonic}"`);
    console.log('\n📋 OBSERVED BEHAVIOR:');
    console.log('   • Each line has a "tonic" field');
    console.log('   • The value is ALWAYS empty string');
    console.log('   • UI has "Line > Set Tonic..." menu item');
    console.log('   • Same issue as document tonic');

    console.log('\n✅ REQUIRED FIX:');
    console.log('   Same as document tonic - add WASM functions');

    // Verify: line tonic is empty string
    expect(lineTonic).toBe('');
  });
});
