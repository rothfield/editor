import { test, expect } from '@playwright/test';

test.describe('Set Tonic via UI Menu - FAILING', () => {
  test('BUG: Setting tonic via File menu does not persist in document model', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type some musical content
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   SET TONIC VIA UI MENU - PERSISTENCE BUG            ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Check persistent model BEFORE setting tonic
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);
    let persistentModel = await page.locator('[data-testid="pane-docmodel"]').innerText();
    let tonicLineBefore = persistentModel.split('\n').find(line => line.includes('tonic:'));

    console.log('📋 BEFORE setting tonic via UI:');
    console.log('   Persistent Model Tab shows:', tonicLineBefore?.trim() || 'tonic field not found');
    console.log('');

    // Now use the UI menu to set tonic (simulating what user does)
    // Intercept the prompt to return "D" automatically
    page.on('dialog', async dialog => {
      await dialog.accept('D');
    });

    // Click the File > Set Tonic menu item
    await page.click('button:has-text("File")');
    await page.waitForTimeout(200);

    // Find the File menu's "Set Tonic" button (first one in the DOM)
    const fileMenuButtons = await page.locator('#file-menu #menu-set-tonic').all();
    if (fileMenuButtons.length > 0) {
      await fileMenuButtons[0].click();
    }

    // Wait for dialog and processing
    await page.waitForTimeout(500);

    await page.waitForTimeout(500);

    // Check persistent model AFTER setting tonic
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);
    persistentModel = await page.locator('[data-testid="pane-docmodel"]').innerText();
    let tonicLineAfter = persistentModel.split('\n').find(line => line.includes('tonic:'));

    console.log('📋 AFTER setting tonic via UI menu (File > Set Tonic > "D"):');
    console.log('   Persistent Model Tab shows:', tonicLineAfter?.trim() || 'tonic field not found');
    console.log('');

    console.log('🐛 EXPECTED vs ACTUAL:');
    console.log('   Expected: tonic: "D"');
    console.log('   Actual:  ', tonicLineAfter?.trim() || 'tonic: null');
    console.log('');

    console.log('📁 ROOT CAUSE:');
    console.log('   • Persistent Model tab shows serialized JSON from getDocument()');
    console.log('   • getDocument() calls wasmModule.getDocumentSnapshot()');
    console.log('   • If tonic is not in WASM document, it won\'t appear in persistent model');
    console.log('');

    // Verify the bug: tonic should be "D" but might still be null
    expect(tonicLineAfter).toContain('tonic: "D"');
  });

  test('BUG: Setting line tonic via Line menu does not persist', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Type content to create a line
    await editor.click();
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   SET LINE TONIC VIA UI MENU - PERSISTENCE BUG       ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Use UI menu to set line tonic
    page.on('dialog', async dialog => {
      await dialog.accept('G');
    });

    await page.click('button:has-text("Line")');
    await page.waitForTimeout(200);

    // Find the Line menu's "Set Tonic" button
    const lineMenuButtons = await page.locator('#line-menu #menu-set-tonic').all();
    if (lineMenuButtons.length > 0) {
      await lineMenuButtons[0].click();
    }

    await page.waitForTimeout(500);

    // Check persistent model
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(300);
    const persistentModel = await page.locator('[data-testid="pane-docmodel"]').innerText();

    const linesMatch = persistentModel.match(/lines:\s*-[\s\S]*?tonic:\s*\"?([^\s\"]*)\"?/);
    const lineTonic = linesMatch ? linesMatch[1] : 'NOT_FOUND';

    console.log('📋 AFTER setting line tonic via UI menu (Line > Set Tonic > "G"):');
    console.log('   Line tonic in persistent model:', `"${lineTonic}"`);
    console.log('');

    console.log('🐛 EXPECTED vs ACTUAL:');
    console.log('   Expected: "G"');
    console.log('   Actual:  ', `"${lineTonic}"`);
    console.log('');

    // Verify: should be "G"
    expect(lineTonic).toBe('G');
  });
});
