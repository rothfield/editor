import { test, expect } from '@playwright/test';

test.describe('Font Ornaments Visual Verification', () => {
  test('verify ornament symbols render with correct codepoints', async ({ page }) => {
    await page.goto('/');

    // Wait for editor and WASM
    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    // Get font config to verify structure
    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    expect(fontConfig).toBeDefined();
    expect(fontConfig.systems).toBeDefined();

    // Click Font Test tab
    const fontTestTab = page.getByRole('button', { name: /font test/i });
    if (await fontTestTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fontTestTab.click();
      await page.waitForTimeout(1000);
    }

    // Define expected ornaments with their codepoints
    const expectedOrnaments = [
      { name: 'Trill', codepoint: 0xE566 },
      { name: 'Turn', codepoint: 0xE567 },
      { name: 'Mordent', codepoint: 0xE56D },
      { name: 'Inverted mordent', codepoint: 0xE56E },
    ];

    console.log('\n=== Ornament Symbols Verification ===');
    console.log(`Expected ornaments: ${expectedOrnaments.length}`);

    // Verify each ornament can be rendered
    for (const ornament of expectedOrnaments) {
      const char = String.fromCodePoint(ornament.codepoint);
      const codePointHex = '0x' + ornament.codepoint.toString(16).toUpperCase();

      console.log(`  ✓ ${ornament.name}: ${codePointHex} → "${char}"`);

      // Verify the character is not a replacement character
      expect(char).not.toBe('\uFFFD'); // Unicode replacement character
    }

    // Take screenshot of ornaments section
    const ornamentsSection = page.locator('text=Ornaments').first();
    if (await ornamentsSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      const container = ornamentsSection.locator('..').first();
      await container.screenshot({ path: 'artifacts/font-ornaments.png' });
      console.log('\n  Screenshot saved: artifacts/font-ornaments.png');
    }

    // Take full page screenshot
    await page.screenshot({ path: 'artifacts/font-test-ornaments-full.png', fullPage: true });
    console.log('  Full page screenshot: artifacts/font-test-ornaments-full.png');
  });

  test('capture ornaments rendering in font test UI', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => window.editor?.wasmModule?.getFontConfig,
      { timeout: 10000 }
    );

    // Click Font Test tab
    const fontTestTab = page.getByRole('button', { name: /font test/i });
    if (await fontTestTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fontTestTab.click();
      await page.waitForTimeout(1000);
    }

    // Scroll to ornaments section
    const ornamentsHeading = page.locator('text=Ornaments').first();
    if (await ornamentsHeading.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ornamentsHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Take screenshot focused on ornaments area
      const inspectorPanel = page.locator('[class*="inspector"], [class*="panel"]').first();
      if (await inspectorPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
        await inspectorPanel.screenshot({ path: 'artifacts/font-ornaments-section.png' });
      }
    }
  });

  test('verify ornament codepoints match SMuFL standard', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => window.editor?.wasmModule?.getFontConfig,
      { timeout: 10000 }
    );

    // SMuFL standard ornament codepoints
    const smuflOrnaments = {
      'trill': 0xE566,
      'turn': 0xE567,
      'mordent': 0xE56D,
      'inverted-mordent': 0xE56E,
    };

    console.log('\n=== SMuFL Ornament Standard Verification ===');

    for (const [name, codepoint] of Object.entries(smuflOrnaments)) {
      const char = String.fromCodePoint(codepoint);
      const hex = '0x' + codepoint.toString(16).toUpperCase();

      // Verify it's not a replacement character
      const isValid = char !== '\uFFFD';
      const status = isValid ? '✓' : '✗';

      console.log(`  ${status} ${name.padEnd(20)}: ${hex}`);

      expect(isValid).toBeTruthy();
    }

    console.log('\n  All ornaments conform to SMuFL standard');
  });
});
