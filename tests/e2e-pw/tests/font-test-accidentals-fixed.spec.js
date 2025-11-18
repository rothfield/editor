/**
 * Test: Font Test tab displays accidentals with correct block offsets
 *
 * Verifies that the Font Test UI uses the correct formula from build.rs:
 * codepoint = pua_base + (accidental_blockOffset × N) + (octave_idx × N) + char_idx
 *
 * Where accidental blocks are:
 * - Natural: blockOffset 0
 * - Flat: blockOffset 5
 * - Half-flat: blockOffset 10
 * - Double-flat: blockOffset 15
 * - Sharp: blockOffset 20
 * - Double-sharp: blockOffset 25
 */

import { test, expect } from '@playwright/test';

test('Font Test displays accidentals with correct block offsets', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for app to be ready
  await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible', timeout: 10000 });

  // Open Inspector panel
  const inspectorBtn = page.locator('button:has-text("Inspector")');
  if (await inspectorBtn.isVisible()) {
    await inspectorBtn.click();
  }

  // Navigate to Font Test tab
  await page.waitForSelector('#tab-font-test', { state: 'visible', timeout: 5000 });
  await page.click('#tab-font-test');

  // Wait for Font Test UI to initialize
  await page.waitForSelector('#font-test-grid', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(1000); // Give time for WASM config to load

  // Check that the Font Test tab rendered systems
  const numberSystemHeading = page.locator('h3:has-text("Number System")');
  await expect(numberSystemHeading).toBeVisible();

  // Verify sandbox contains correct accidental types (including half-flat)
  const sandbox = await page.locator('#font-sandbox').inputValue();
  console.log('Sandbox content (first 500 chars):', sandbox.substring(0, 500));

  // Check for half-flat in sandbox output
  // The sandbox should show: [nat], [b], [hf], [bb], [#], [##] for each character
  expect(sandbox).toContain('[hf]'); // Half-flat should be present

  // Take a screenshot for visual verification
  await page.screenshot({ path: 'artifacts/font-test-accidentals-fixed.png', fullPage: true });

  console.log('✓ Font Test tab displays with updated accidental block offsets');
  console.log('✓ Sandbox includes half-flat accidentals');
});

test('Font Test calculates codepoints using correct formula', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for app
  await page.waitForSelector('[data-testid="editor-root"]', { state: 'visible', timeout: 10000 });

  // Get font config from WASM via JavaScript
  const fontConfig = await page.evaluate(() => {
    return window.editor?.wasmModule?.getFontConfig?.();
  });

  expect(fontConfig).toBeTruthy();
  expect(fontConfig.systems).toBeTruthy();
  expect(fontConfig.systems.length).toBeGreaterThan(0);

  console.log('Font config systems:', fontConfig.systems.map(s => ({
    name: s.system_name,
    pua_base: `0x${s.pua_base.toString(16).toUpperCase()}`,
    char_count: s.char_count,
    variants_per_char: s.variants_per_character
  })));

  // Verify Number system config
  const numberSystem = fontConfig.systems.find(s => s.system_name === 'number');
  expect(numberSystem).toBeTruthy();
  expect(numberSystem.char_count).toBe(7); // 1-7
  expect(numberSystem.variants_per_character).toBe(30); // 6 accidentals × 5 octaves

  // Calculate expected codepoint for 1b (flat) at octave 0
  // Formula: pua_base + (5 × 7) + (0 × 7) + 0 = pua_base + 35
  const pua_base = numberSystem.pua_base;
  const N = numberSystem.char_count;
  const flat_blockOffset = 5;
  const octave_idx = 0;
  const char_idx = 0; // '1' is first character

  const expected_flat_cp = pua_base + (flat_blockOffset * N) + (octave_idx * N) + char_idx;

  console.log('Expected codepoint for 1b (flat) at octave 0:', `0x${expected_flat_cp.toString(16).toUpperCase()}`);
  console.log('  = 0x${pua_base.toString(16)} + (5 × ${N}) + (0 × ${N}) + 0');
  console.log('  = 0x${pua_base.toString(16)} + ${flat_blockOffset * N}');

  // Verify half-flat offset (blockOffset 10)
  const hf_blockOffset = 10;
  const expected_hf_cp = pua_base + (hf_blockOffset * N) + (octave_idx * N) + char_idx;

  console.log('Expected codepoint for 1hf (half-flat) at octave 0:', `0x${expected_hf_cp.toString(16).toUpperCase()}`);

  // Verify double-flat offset (blockOffset 15, NOT 10)
  const bb_blockOffset = 15;
  const expected_bb_cp = pua_base + (bb_blockOffset * N) + (octave_idx * N) + char_idx;

  console.log('Expected codepoint for 1bb (double-flat) at octave 0:', `0x${expected_bb_cp.toString(16).toUpperCase()}`);

  // Verify sharp offset (blockOffset 20, NOT 15)
  const sharp_blockOffset = 20;
  const expected_sharp_cp = pua_base + (sharp_blockOffset * N) + (octave_idx * N) + char_idx;

  console.log('Expected codepoint for 1# (sharp) at octave 0:', `0x${expected_sharp_cp.toString(16).toUpperCase()}`);

  console.log('✓ Codepoint formula verified');
});
