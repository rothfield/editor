import { test, expect } from '../fixtures/editor.fixture';

test.describe('Font Config - Per-System PUA Architecture', () => {
  test('getFontConfig exports correct per-system configuration', async ({ cleanPage: page }) => {
    // Capture console messages for debugging
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Navigate to app
    await page.goto('/');

    // Wait for WASM to load
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

    // Call getFontConfig through JavaScript
    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    // Verify structure
    expect(fontConfig).toBeDefined();
    expect(fontConfig.systems).toBeDefined();
    expect(Array.isArray(fontConfig.systems)).toBe(true);
    expect(fontConfig.systems.length).toBe(4);

    // Expected system configurations (25 variants per char - group-by-accidental-then-octave)
    // 5 accidental types × 5 octaves = 25 variants per character
    const expectedSystems = [
      { name: 'number', base: 0xE100, chars: 7, variants: 25, total: 175 },
      { name: 'western', base: 0xE200, chars: 14, variants: 25, total: 350 },
      { name: 'sargam', base: 0xE400, chars: 12, variants: 25, total: 300 },
      { name: 'doremi', base: 0xE600, chars: 14, variants: 25, total: 350 },
    ];

    // Verify each system
    for (const expected of expectedSystems) {
      const systemConfig = fontConfig.systems.find(s => s.system_name === expected.name);

      expect(systemConfig).toBeDefined();
      expect(systemConfig.pua_base).toBe(expected.base);
      expect(systemConfig.char_count).toBe(expected.chars);
      expect(systemConfig.variants_per_character).toBe(expected.variants);
      expect(systemConfig.total_glyphs).toBe(expected.total);
    }

    // Verify total allocation
    const totalGlyphs = fontConfig.systems.reduce((sum, sys) => sum + sys.total_glyphs, 0);
    expect(totalGlyphs).toBe(1175); // 175 + 350 + 300 + 350 (25 variants per char)
  });

  test('font config correctly spans PUA ranges for each system', async ({ cleanPage: page }) => {
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

    // Calculate ranges for each system
    const ranges = fontConfig.systems.map(sys => ({
      name: sys.system_name,
      start: sys.pua_base,
      end: sys.pua_base + (sys.total_glyphs - 1),
      total: sys.total_glyphs,
    }));

    // Expected ranges (25 variants per character - fully PUA-based)
    // Formula: start = base, end = base + (total_glyphs - 1)
    const expectedRanges = [
      { name: 'number', start: 0xE100, end: 0xE1AE, total: 175 },      // 0xE100 + 174 = 57774
      { name: 'western', start: 0xE200, end: 0xE35D, total: 350 },    // 0xE200 + 349 = 58205
      { name: 'sargam', start: 0xE400, end: 0xE52B, total: 300 },     // 0xE400 + 299 = 58667
      { name: 'doremi', start: 0xE600, end: 0xE75D, total: 350 },     // 0xE600 + 349 = 59037
    ];

    ranges.forEach((range, idx) => {
      const expected = expectedRanges[idx];
      expect(range.name).toBe(expected.name);
      expect(range.start).toBe(expected.start);
      expect(range.end).toBe(expected.end);
      expect(range.total).toBe(expected.total);
    });

    // Verify no overlap between systems
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const range1 = ranges[i];
        const range2 = ranges[j];

        // Check no overlap
        const overlap1 = range1.start <= range2.end && range1.end >= range2.start;
        expect(overlap1).toBe(false);
      }
    }
  });

  test('font config character counts match atom definitions', async ({ cleanPage: page }) => {
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

    // Expected character counts from atoms.yaml
    const expectedCounts = {
      number: 7,      // 1-7
      western: 14,    // C-B, c-b (7 natural + 7 lowercase)
      sargam: 12,     // Sa Re Ga Ma Pa Dha Ni (7) + variants
      doremi: 14,     // do re mi fa sol la ti (7) + variants
    };

    for (const [systemName, expectedCount] of Object.entries(expectedCounts)) {
      const systemConfig = fontConfig.systems.find(s => s.system_name === systemName);
      expect(systemConfig.char_count).toBe(expectedCount);
    }
  });

  test('no console errors when accessing font config', async ({ cleanPage: page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        // Filter out non-critical errors (like font mapping file fetch)
        const text = msg.text();
        if (!text.includes('Failed to load font mapping') && !text.includes('TypeError: Failed to fetch')) {
          consoleErrors.push(text);
        }
      }
    });

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

    // Call getFontConfig
    const fontConfig = await page.evaluate(() => {
      try {
        return window.editor.wasmModule.getFontConfig();
      } catch (e) {
        return { error: e.message };
      }
    });

    expect(fontConfig.error).toBeUndefined();
    expect(consoleErrors).toEqual([]);
  });
});
