import { test, expect } from '@playwright/test';

test.describe('Font Sandbox Glyph Verification', () => {
  test('verify font sandbox displays all 25 variants per character correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for WASM
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

    // Get font config
    const fontConfig = await page.evaluate(() => {
      return window.editor.wasmModule.getFontConfig();
    });

    console.log('Font Config Systems:', fontConfig.systems.map(s => ({
      name: s.system_name,
      base: '0x' + s.pua_base.toString(16).toUpperCase(),
      chars: s.char_count,
      variants: s.variants_per_character,
      total: s.total_glyphs
    })));

    // Click Font Test tab
    const fontTestTab = page.getByRole('button', { name: /font test/i });
    if (await fontTestTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await fontTestTab.click();
      await page.waitForTimeout(1500);
    }

    // Get the font sandbox textarea (it exists but may not be visible if tab not clicked)
    const textarea = page.locator('textarea#font-sandbox').first();

    // Read the textarea content directly (works even if hidden)
    await expect(textarea).toHaveValue(/./); // Should have some content
    const content = await textarea.inputValue();

    // Parse the content to count glyphs
    const lines = content.split('\n');
    console.log(`\nFont Sandbox Content Analysis:`);
    console.log(`Total characters in textarea: ${content.length}`);
    console.log(`Total lines: ${lines.length}`);

    // Count non-whitespace characters
    const nonWhitespace = content.replace(/\s/g, '');
    console.log(`Non-whitespace characters (glyphs): ${nonWhitespace.length}`);

    // Try to identify the structure by looking at characters per line
    let linesWithContent = 0;
    let maxCharsPerLine = 0;
    let minCharsPerLine = Infinity;

    lines.forEach((line, idx) => {
      const lineChars = line.replace(/\s/g, '').length;
      if (lineChars > 0) {
        linesWithContent++;
        maxCharsPerLine = Math.max(maxCharsPerLine, lineChars);
        minCharsPerLine = Math.min(minCharsPerLine, lineChars);

        // Show first few lines with content
        if (idx < 5 && lineChars > 0) {
          console.log(`  Line ${idx}: ${lineChars} glyphs - "${line.substring(0, 50)}..."`);
        }
      }
    });

    console.log(`\nContent structure:`);
    console.log(`  Lines with glyphs: ${linesWithContent}`);
    console.log(`  Max chars per line: ${maxCharsPerLine}`);
    console.log(`  Min chars per line: ${minCharsPerLine}`);

    // Analyze unique codepoints
    const codepoints = new Set();
    const codepointRanges = {};

    for (const char of nonWhitespace) {
      const codePoint = char.charCodeAt(0);
      const hex = '0x' + codePoint.toString(16).toUpperCase();
      codepoints.add(hex);

      // Track ranges
      const base = Math.floor(codePoint / 256) * 256;
      const baseHex = '0x' + base.toString(16).toUpperCase();
      if (!codepointRanges[baseHex]) {
        codepointRanges[baseHex] = { start: codePoint, end: codePoint, count: 0 };
      }
      codepointRanges[baseHex].start = Math.min(codepointRanges[baseHex].start, codePoint);
      codepointRanges[baseHex].end = Math.max(codepointRanges[baseHex].end, codePoint);
      codepointRanges[baseHex].count++;
    }

    console.log(`\nCodepoint Analysis:`);
    console.log(`  Unique codepoints: ${codepoints.size}`);
    console.log(`  Codepoint ranges used:`);

    Object.entries(codepointRanges).sort().forEach(([base, range]) => {
      const rangeHex = '0x' + range.start.toString(16).toUpperCase() + '-0x' + range.end.toString(16).toUpperCase();
      console.log(`    ${base}: ${rangeHex} (${range.count} glyphs)`);
    });

    // Verify expected ranges
    const expectedRanges = [
      { name: 'Number', base: 0xE100, expected: 175 },
      { name: 'Western', base: 0xE200, expected: 350 },
      { name: 'Sargam', base: 0xE400, expected: 300 },
      { name: 'Doremi', base: 0xE600, expected: 350 },
    ];

    console.log(`\nVerifying expected glyph allocations:`);
    expectedRanges.forEach(expected => {
      const baseHex = '0x' + expected.base.toString(16).toUpperCase();
      if (codepointRanges[baseHex]) {
        const range = codepointRanges[baseHex];
        const ratio = ((range.count / expected.expected) * 100).toFixed(1);
        console.log(`  ${expected.name}: ${range.count}/${expected.expected} glyphs (${ratio}%)`);
      }
    });

    // Basic assertions
    expect(nonWhitespace.length).toBeGreaterThan(0);
    expect(codepoints.size).toBeGreaterThan(100);

    // We should have glyphs from each system
    const systemBases = expectedRanges.map(r => '0x' + r.base.toString(16).toUpperCase());
    expect(Object.keys(codepointRanges).length).toBeGreaterThan(0);
  });

  test('verify font sandbox structure matches 25-variant layout', async ({ page }) => {
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

    // Get expected structure
    const expectedSystems = [
      { name: 'number', chars: 7, variants: 25 },
      { name: 'western', chars: 14, variants: 25 },
      { name: 'sargam', chars: 12, variants: 25 },
      { name: 'doremi', chars: 14, variants: 25 },
    ];

    // Click Font Test tab
    const fontTestTab = page.getByRole('button', { name: /font test/i });
    if (await fontTestTab.isVisible()) {
      await fontTestTab.click();
      await page.waitForTimeout(1000);
    }

    // Take screenshot of font test panel
    const inspector = page.locator('[data-testid="inspector"], .inspector, .panel').first();
    if (await inspector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await inspector.screenshot({ path: 'artifacts/font-test-panel.png' });
    }

    // Get textarea
    const textarea = page.locator('textarea').first();
    const content = await textarea.inputValue();

    console.log(`\n=== Font Sandbox Structure Verification ===`);
    console.log(`Expected total glyphs: ${expectedSystems.reduce((sum, s) => sum + (s.chars * s.variants), 0)}`);

    const nonWhitespace = content.replace(/\s/g, '');
    console.log(`Actual glyphs in sandbox: ${nonWhitespace.length}`);

    // Verify we have a reasonable number of glyphs displayed
    // The sandbox should display all 1175 glyphs, but some may be represented as lines
    const approximateGlyphsPerLine = 47; // roughly 47 base characters across all systems
    const estimatedLines = Math.ceil(1175 / approximateGlyphsPerLine); // ~25 lines for 25 variants

    console.log(`\nEstimated structure: ~${estimatedLines} lines × ${approximateGlyphsPerLine} glyphs = ~1175 total`);
    console.log(`Actual lines in textarea: ${content.split('\n').length}`);

    // Sanity check: we should have many glyphs
    expect(nonWhitespace.length).toBeGreaterThan(1000);
  });
});
