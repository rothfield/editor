import { test, expect } from '@playwright/test';

test('diagnostic: measure span widths in JavaScript (debugging renderer.measureAllWidths)', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "abc"
  await page.keyboard.type('abc');
  await page.waitForTimeout(300);

  // Manually measure the spans like renderer.measureAllWidths does
  const measurements = await page.evaluate(() => {
    const BASE_FONT_SIZE = 16;

    // Create temporary invisible container
    const temp = document.createElement('div');
    temp.style.cssText = 'position:absolute; left:-9999px; visibility:hidden; pointer-events:none;';
    document.body.appendChild(temp);

    const results = [];

    // Measure "a"
    const spanA = document.createElement('span');
    spanA.className = 'char-cell';
    spanA.textContent = 'a';
    temp.appendChild(spanA);
    const widthA = spanA.getBoundingClientRect().width;
    results.push({ char: 'a', width: widthA });
    temp.removeChild(spanA);

    // Measure "b"
    const spanB = document.createElement('span');
    spanB.className = 'char-cell';
    spanB.textContent = 'b';
    temp.appendChild(spanB);
    const widthB = spanB.getBoundingClientRect().width;
    results.push({ char: 'b', width: widthB });
    temp.removeChild(spanB);

    // Measure "c"
    const spanC = document.createElement('span');
    spanC.className = 'char-cell';
    spanC.textContent = 'c';
    temp.appendChild(spanC);
    const widthC = spanC.getBoundingClientRect().width;
    results.push({ char: 'c', width: widthC });
    temp.removeChild(spanC);

    // Also check the renderer's cellWidths directly
    const app = window.MusicNotationApp.app();
    const renderer = app.editor.renderer;
    const doc = app.editor.theDocument;

    const cellWidths = [];
    for (const cell of doc.lines[0].cells) {
      const span = document.createElement('span');
      span.className = 'char-cell';
      span.textContent = cell.char === ' ' ? '\u00A0' : cell.char;
      temp.appendChild(span);
      cellWidths.push({
        char: cell.char,
        measured_width: span.getBoundingClientRect().width
      });
      temp.removeChild(span);
    }

    document.body.removeChild(temp);

    return {
      individual_spans: results,
      cells_from_doc: doc.lines[0].cells.map(c => ({ char: c.char })),
      cell_widths_measured: cellWidths
    };
  });

  console.log('\n=== INDIVIDUAL SPAN MEASUREMENTS ===');
  measurements.individual_spans.forEach(m => {
    console.log(`"${m.char}": ${m.width}`);
  });

  console.log('\n=== CELLS FROM DOCUMENT ===');
  measurements.cells_from_doc.forEach(c => {
    console.log(`Cell: "${c.char}"`);
  });

  console.log('\n=== CELL WIDTHS MEASURED ===');
  measurements.cell_widths_measured.forEach(cw => {
    console.log(`"${cw.char}": ${cw.measured_width}`);
  });

  // Now check what the renderer stored
  const rendererData = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const renderer = app.editor.renderer;

    return {
      characterWidthData: renderer.characterWidthData,
      displayList: renderer.displayList ? {
        lines: renderer.displayList.lines.map(line => ({
          cells: line.cells.map(cell => ({
            char: cell.char,
            w: cell.w,
            cursor_left: cell.cursor_left,
            cursor_right: cell.cursor_right
          }))
        }))
      } : null
    };
  });

  console.log('\n=== RENDERER CHARACTER WIDTH DATA ===');
  if (rendererData.characterWidthData) {
    rendererData.characterWidthData.forEach((data, idx) => {
      console.log(`[${idx}] glyph="${data.glyph}": ${JSON.stringify(data.charWidths)}`);
    });
  }

  console.log('\n=== DISPLAY LIST (FROM RUST) ===');
  if (rendererData.displayList) {
    rendererData.displayList.lines[0].cells.forEach((cell, idx) => {
      console.log(`[${idx}] "${cell.char}": w=${cell.w}, cursor_left=${cell.cursor_left}, cursor_right=${cell.cursor_right}`);
    });
  }

  expect(measurements.individual_spans.length).toBe(3);
});
