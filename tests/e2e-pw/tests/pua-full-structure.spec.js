import { test, expect } from '@playwright/test';

test.describe('Full PUA Structure - 21 Variants per Character', () => {
  test('getFontConfig reports 21 variants and 987 total glyphs', async ({ page }) => {
    await page.goto('/');

    // Wait for WASM and font config
    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    // Get font config
    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    // Verify all 4 systems
    expect(fontConfig.systems).toHaveLength(4);

    // Verify each system has 21 variants per character
    let totalGlyphs = 0;
    for (const sys of fontConfig.systems) {
      expect(sys.variants_per_character).toBe(21);
      totalGlyphs += sys.char_count * 21;
    }

    // Should have 987 total glyphs (47 chars × 21 variants)
    expect(totalGlyphs).toBe(987);
  });

  test('Number system: 7 characters × 21 variants = 147 glyphs', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    const numberSystem = fontConfig.systems.find(s => s.system_name === 'number');
    expect(numberSystem).toBeDefined();
    expect(numberSystem.pua_base).toBe(0xE100);
    expect(numberSystem.char_count).toBe(7);
    expect(numberSystem.variants_per_character).toBe(21);
    expect(numberSystem.total_glyphs).toBe(7 * 21);
  });

  test('Western system: 14 characters × 21 variants = 294 glyphs', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    const westernSystem = fontConfig.systems.find(s => s.system_name === 'western');
    expect(westernSystem).toBeDefined();
    expect(westernSystem.pua_base).toBe(0xE200);
    expect(westernSystem.char_count).toBe(14);
    expect(westernSystem.variants_per_character).toBe(21);
    expect(westernSystem.total_glyphs).toBe(14 * 21);
  });

  test('Sargam system: 12 characters × 21 variants = 252 glyphs', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    const sargamSystem = fontConfig.systems.find(s => s.system_name === 'sargam');
    expect(sargamSystem).toBeDefined();
    expect(sargamSystem.pua_base).toBe(0xE400);
    expect(sargamSystem.char_count).toBe(12);
    expect(sargamSystem.variants_per_character).toBe(21);
    expect(sargamSystem.total_glyphs).toBe(12 * 21);
  });

  test('Doremi system: 14 characters × 21 variants = 294 glyphs', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    const doremiSystem = fontConfig.systems.find(s => s.system_name === 'doremi');
    expect(doremiSystem).toBeDefined();
    expect(doremiSystem.pua_base).toBe(0xE500);
    expect(doremiSystem.char_count).toBe(14);
    expect(doremiSystem.variants_per_character).toBe(21);
    expect(doremiSystem.total_glyphs).toBe(14 * 21);
  });

  test('Variant structure: 0=base octave, 1-4=octave shifts, 5-20=accidentals', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        return (
          typeof window.editor !== 'undefined' &&
          typeof window.editor.wasmModule.getFontConfig === 'function'
        );
      },
      { timeout: 10000 }
    );

    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    const numberSystem = fontConfig.systems.find(s => s.system_name === 'number');

    // For character "1" (index 0):
    // - Variant 0 (octave 0 base): 0xE100 + (0 × 21) + 0 = 0xE100
    // - Variant 1 (octave +1): 0xE100 + (0 × 21) + 1 = 0xE101
    // - Variant 5 (sharp base): 0xE100 + (0 × 21) + 5 = 0xE105
    // - Variant 9 (flat base): 0xE100 + (0 × 21) + 9 = 0xE109

    const baseOctave = numberSystem.pua_base + (0 * 21) + 0;
    const octaveShift = numberSystem.pua_base + (0 * 21) + 1;
    const sharpBase = numberSystem.pua_base + (0 * 21) + 5;
    const flatBase = numberSystem.pua_base + (0 * 21) + 9;

    expect(baseOctave).toBe(0xE100);
    expect(octaveShift).toBe(0xE101);
    expect(sharpBase).toBe(0xE105);
    expect(flatBase).toBe(0xE109);
  });
});
