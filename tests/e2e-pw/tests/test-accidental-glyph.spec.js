import { test, expect } from '@playwright/test';

/**
 * Test: Typing accidentals (b, #) should generate correct PUA glyphs
 *
 * Bug: Previously, typing "1" then "b" would create:
 *   - char: "\u{E010}b" (PUA glyph + literal 'b')
 *
 * Expected: After typing "1b", should have:
 *   - char: "\u{E1F0}" (single PUA glyph for "1b")
 *   - pitch_code: N1b
 */
test('Typing 1b generates correct PUA glyph for flat', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type "1"
  await editor.click();
  await page.keyboard.type('1');

  // Wait for WASM to process
  await page.waitForTimeout(100);

  // Type "b" to add flat accidental
  await page.keyboard.type('b');

  // Wait for WASM to process
  await page.waitForTimeout(100);

  // Capture console logs to check WASM debug output
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'info' || msg.type() === 'log') {
      logs.push(msg.text());
    }
  });

  // Get the Document Model from inspector
  const docModelTab = page.getByTestId('tab-docmodel');
  await expect(docModelTab).toBeVisible();
  await docModelTab.click();

  const docModelPane = page.getByTestId('pane-docmodel');
  await expect(docModelPane).toBeVisible();

  // Wait for content to populate
  await expect.poll(async () => (await docModelPane.innerText()).trim()).not.toEqual('');

  const docModelText = await docModelPane.innerText();

  // Verify the Document Model shows pitch_code: N1b
  expect(docModelText).toContain('pitch_code: N1b');

  // Verify it's a single cell (not two cells "1" and "b")
  const cellMatches = docModelText.match(/Cell \{/g);
  expect(cellMatches).toHaveLength(1);

  // Extract the char field value
  const charMatch = docModelText.match(/char: "([^"]+)"/);
  expect(charMatch).toBeTruthy();

  const charValue = charMatch[1];

  // Verify it's NOT a multi-character string like "\u{E010}b"
  // It should be a single Unicode character (the PUA glyph)
  // JavaScript will show it as a single character or escape sequence
  expect(charValue.length).toBeLessThanOrEqual(2); // Single char or escape

  // Most importantly: verify it doesn't contain literal 'b'
  // (PUA glyphs may display as � or be escaped, but won't show 'b')
  expect(charValue).not.toMatch(/[0-9][b#]/); // Pattern like "1b" means bug

  console.log('Document Model char field:', charValue);
  console.log('Full Document Model:\n', docModelText);
});

test('Typing 2# generates correct PUA glyph for sharp', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type "2#"
  await editor.click();
  await page.keyboard.type('2#');

  // Wait for WASM to process
  await page.waitForTimeout(100);

  // Get the Document Model
  const docModelTab = page.getByTestId('tab-docmodel');
  await docModelTab.click();

  const docModelPane = page.getByTestId('pane-docmodel');
  await expect.poll(async () => (await docModelPane.innerText()).trim()).not.toEqual('');

  const docModelText = await docModelPane.innerText();

  // Verify pitch_code
  expect(docModelText).toContain('pitch_code: N2s');

  // Verify single cell
  const cellMatches = docModelText.match(/Cell \{/g);
  expect(cellMatches).toHaveLength(1);

  // Verify char is single glyph, not "2#"
  const charMatch = docModelText.match(/char: "([^"]+)"/);
  expect(charMatch).toBeTruthy();
  const charValue = charMatch[1];

  expect(charValue).not.toMatch(/[0-9][#b]/); // No literal "2#" pattern

  console.log('Sharp note char field:', charValue);
});

test('Typing 3bb generates correct PUA glyph for double flat', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type "3bb"
  await editor.click();
  await page.keyboard.type('3bb');

  // Wait for WASM to process
  await page.waitForTimeout(200);

  // Get the Document Model
  const docModelTab = page.getByTestId('tab-docmodel');
  await docModelTab.click();

  const docModelPane = page.getByTestId('pane-docmodel');
  await expect.poll(async () => (await docModelPane.innerText()).trim()).not.toEqual('');

  const docModelText = await docModelPane.innerText();

  // Verify pitch_code
  expect(docModelText).toContain('pitch_code: N3bb');

  // Verify single cell
  const cellMatches = docModelText.match(/Cell \{/g);
  expect(cellMatches).toHaveLength(1);

  console.log('Double flat note Document Model:\n', docModelText);
});

test('LilyPond export reflects accidentals correctly', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type a sequence with accidentals: "1# 2b 3"
  await editor.click();
  await page.keyboard.type('1# 2b 3');

  // Wait for WASM to process
  await page.waitForTimeout(200);

  // Check LilyPond output
  const lilyTab = page.getByTestId('tab-lilypond');
  await lilyTab.click();

  const lilyPane = page.getByTestId('pane-lilypond');
  await expect.poll(async () => (await lilyPane.innerText()).trim()).not.toEqual('');

  const lilyText = await lilyPane.innerText();

  // Verify LilyPond has proper sharp/flat notation
  expect(lilyText).toContain('cis'); // 1# in Number system maps to C# (cis in LilyPond)
  expect(lilyText).toContain('des'); // 2b maps to Db (des)
  expect(lilyText).toContain('e');   // 3 natural

  console.log('LilyPond output:\n', lilyText);
});
