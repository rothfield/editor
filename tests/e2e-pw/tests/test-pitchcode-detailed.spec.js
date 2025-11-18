import { test, expect } from '@playwright/test';

test('Verify pitchCode and char are both set for "1"', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Type "1"
  await editor.click();
  await page.keyboard.type('1');
  await page.waitForTimeout(500);

  // Get document data via JavaScript
  const cellData = await page.evaluate(() => {
    const doc = window.editor.wasmModule.getDocumentSnapshot();
    const parsed = JSON.parse(doc);
    const firstCell = parsed.lines[0].cells[0];

    return {
      char: firstCell.char,
      charLength: firstCell.char ? firstCell.char.length : 0,
      charCodePoint: firstCell.char && firstCell.char.length > 0
        ? firstCell.char.charCodeAt(0).toString(16)
        : 'empty',
      pitchCode: firstCell.pitch_code,
      pitchSystem: firstCell.pitch_system,
      octave: firstCell.octave,
      kind: firstCell.kind
    };
  });

  console.log('\n=== Cell Data for "1" ===');
  console.log('pitch_code:', cellData.pitchCode);
  console.log('pitch_system:', cellData.pitchSystem);
  console.log('octave:', cellData.octave);
  console.log('char length:', cellData.charLength);
  console.log('char codepoint:', cellData.charCodePoint);
  console.log('kind:', cellData.kind);
  console.log('========================\n');

  // Verify pitch_code is set
  expect(cellData.pitchCode).toBe('N1');

  // Verify char is not empty
  expect(cellData.charLength).toBeGreaterThan(0);

  // Verify char is the expected Unicode code point (U+E100 for "1" at base octave)
  expect(cellData.charCodePoint).toBe('e100');
});
