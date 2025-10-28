import { test, expect } from '@playwright/test';

test('diagnostic: check cell structure when typing "abc"', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "abc"
  await page.keyboard.type('abc');
  await page.waitForTimeout(300);

  const cellData = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const doc = app.editor.theDocument;

    return {
      line_count: doc.lines.length,
      cells: doc.lines[0].cells.map(cell => ({
        char: cell.char,
        char_codes: Array.from(cell.char).map(c => c.charCodeAt(0)),
        kind: cell.kind,
        continuation: cell.continuation,
        length: cell.char.length,
        char_count: cell.char.charCount ? cell.char.charCount() : 'N/A'
      }))
    };
  });

  console.log('\n=== CELL STRUCTURE ===');
  console.log(`Lines: ${cellData.line_count}`);
  console.log('Cells:');
  cellData.cells.forEach((cell, idx) => {
    console.log(`[${idx}] char="${cell.char}" (${cell.char.length} bytes) codes=[${cell.char_codes.join(', ')}]`);
    console.log(`     kind=${cell.kind}, continuation=${cell.continuation}`);
  });

  // Now check what the renderer is measuring
  const rendererMeasurements = await page.evaluate(async () => {
    const app = window.MusicNotationApp.app();
    const renderer = app.editor.renderer;
    const BASE_FONT_SIZE = 16;

    // Manually call measureCharacterWidths like the renderer does
    const doc = app.editor.theDocument;
    const characterData = [];

    // Create temporary invisible container for measurements
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    let cellIndex = 0;
    for (const line of doc.lines) {
      for (const cell of line.cells) {
        const charWidths = [];
        const charDetails = [];

        // Measure each character in the cell's glyph
        if (cell.continuation && cell.kind !== 'text') {
          // Continuation cells with minimal width (for accidentals like #, b)
          for (const char of cell.char) {
            charWidths.push(BASE_FONT_SIZE * 0.1);
          }
        } else {
          // Normal cells or text continuations: measure actual character widths
          for (const char of cell.char) {
            const span = document.createElement('span');
            span.className = 'char-cell';
            span.textContent = char === ' ' ? '\u00A0' : char;
            temp.appendChild(span);
            const width = span.getBoundingClientRect().width;
            const computed = window.getComputedStyle(span);
            charWidths.push(width);
            charDetails.push({
              char: char,
              width: width,
              font_family: computed.fontFamily,
              font_size: computed.fontSize,
              font_weight: computed.fontWeight,
              font_style: computed.fontStyle
            });
            temp.removeChild(span);
          }
        }

        characterData.push({
          cellIndex,
          glyph: cell.char,
          charWidths,
          charDetails
        });

        cellIndex++;
      }
    }

    document.body.removeChild(temp);

    return characterData;
  });

  console.log('\n=== RENDERER MEASUREMENT DETAILS ===');
  rendererMeasurements.forEach((data, idx) => {
    console.log(`[${idx}] "${data.glyph}": widths=[${data.charWidths.join(', ')}]`);
    data.charDetails.forEach((detail, charIdx) => {
      console.log(`     char[${charIdx}] "${detail.char}": ${detail.width}px`);
      console.log(`              ${detail.font_family} / ${detail.font_size} / ${detail.font_weight} / ${detail.font_style}`);
    });
  });

  expect(cellData.cells.length).toBe(3);
  expect(cellData.cells[0].char).toBe('a');
  expect(cellData.cells[1].char).toBe('b');
  expect(cellData.cells[2].char).toBe('c');
});
