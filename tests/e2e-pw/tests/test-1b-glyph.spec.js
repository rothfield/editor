import { test, expect } from '@playwright/test';

test('Typing 1b should give 1 flat, not octave -2', async ({ page }) => {
  await page.goto('http://localhost:8080');

  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  console.log('\n=== Testing 1b glyph ===\n');

  await editor.click();
  await page.keyboard.type('1b');
  await page.waitForTimeout(300);

  // Check what was actually created
  const doc = await page.evaluate(() => {
    const doc = window.editor.getDocument();
    return {
      lines: doc.lines.map(line => ({
        cells: line.cells.map(cell => ({
          char: cell.char,
          kind: cell.kind,
          pitch_code: cell.pitch_code
        }))
      }))
    };
  });

  console.log('Document cells:', JSON.stringify(doc, null, 2));

  // What does the first cell look like?
  const firstCell = doc.lines[0]?.cells[0];
  console.log('First cell char:', firstCell?.char);
  console.log('First cell kind:', firstCell?.kind);
  console.log('First cell pitch_code:', firstCell?.pitch_code);

  // Check the actual codepoint
  const codepoint = firstCell?.char?.charCodeAt(0);
  console.log('First cell codepoint:', codepoint ? '0x' + codepoint.toString(16).toUpperCase() : 'N/A');

  // Check the visual rendering
  const cellText = await page.locator('.char-cell').first().textContent();
  console.log('Visual cell text:', cellText);
  const visualCodepoint = cellText?.charCodeAt(0);
  console.log('Visual codepoint:', visualCodepoint ? '0x' + visualCodepoint.toString(16).toUpperCase() : 'N/A');
});
