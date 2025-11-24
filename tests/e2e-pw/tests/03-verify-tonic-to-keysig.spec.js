import { test, expect } from '@playwright/test';

test.describe('Verify Tonic → Key Signature Conversion', () => {
  test('Tonic E should produce key_signature "E major" in IR', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('2 3 4');

    // Set tonic to E
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('E');
    });

    // Render and update
    await page.evaluate(() => window.editor.renderAndUpdate());

    // Get the IR
    const irTab = page.getByTestId('tab-ir');
    if (await irTab.isVisible()) {
      await irTab.click();

      const irPane = page.getByTestId('pane-ir');
      await expect(irPane).toBeVisible();

      const irContent = await irPane.innerText();
      console.log('IR with tonic=E (first 600 chars):', irContent.substring(0, 600));

      // Parse IR JSON
      const irJson = JSON.parse(irContent);

      // Check first part
      expect(irJson[0]).toBeDefined();
      expect(irJson[0].key_signature).toBe('E major');

      console.log('✅ Tonic E correctly produces key_signature "E major"');
    }
  });

  test('Different tonics produce correct key signatures', async ({ page }) => {
    const testCases = [
      { tonic: 'C', expectedSig: 'C major' },
      { tonic: 'G', expectedSig: 'G major' },
      { tonic: 'D', expectedSig: 'D major' },
      { tonic: 'A', expectedSig: 'A major' },
      { tonic: 'F', expectedSig: 'F major' },
    ];

    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    for (const testCase of testCases) {
      // Set tonic
      await page.evaluate((tonic) => {
        window.editor.wasmModule.setDocumentTonic(tonic);
      }, testCase.tonic);

      // Render
      await page.evaluate(() => window.editor.renderAndUpdate());

      // Get document to verify tonic
      const doc = await page.evaluate(() => window.editor.getDocument());
      console.log(`After setting tonic='${testCase.tonic}', document.tonic='${doc.tonic}'`);

      // Get IR
      const ir = await page.evaluate(() => {
        const irText = document.getElementById('ir-display')?.textContent || '';
        if (irText) {
          return JSON.parse(irText);
        }
        return null;
      });

      if (ir && ir[0]) {
        console.log(
          `Tonic '${testCase.tonic}' → key_signature '${ir[0].key_signature}'`
        );
        expect(ir[0].key_signature).toBe(
          testCase.expectedSig,
          `Tonic ${testCase.tonic} should produce ${testCase.expectedSig}`
        );
      }
    }
  });

  test('setTonic updates key_signature in real-time', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => typeof window.editor !== 'undefined',
      { timeout: 15000 }
    );

    const editor = page.locator('[data-testid="editor-root"]');
    await editor.click();
    await page.keyboard.type('1 2 3');

    // Initial tonic
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('C');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    // Get IR from WASM call
    const sig1 = await page.evaluate(() => {
      const irJson = window.editor.wasmModule.generateIRJson();
      const ir = JSON.parse(irJson);
      return ir[0]?.key_signature;
    });

    expect(sig1).toBe('C major');

    // Change tonic
    await page.evaluate(() => {
      window.editor.wasmModule.setDocumentTonic('G');
    });

    await page.evaluate(() => window.editor.renderAndUpdate());

    // Get updated IR
    const sig2 = await page.evaluate(() => {
      const irJson = window.editor.wasmModule.generateIRJson();
      const ir = JSON.parse(irJson);
      return ir[0]?.key_signature;
    });

    expect(sig2).toBe('G major');

    console.log('✅ Tonic change from C to G correctly updates key_signature');
  });
});
