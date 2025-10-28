import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('diagnostic: examine rendering after typing "hello"', async ({ page }) => {
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "hello"
  await page.keyboard.type('hello');
  await page.waitForTimeout(300);

  // 1. DOCUMENT MODEL
  const docModel = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return {
      cells: app.editor.theDocument.lines[0].cells.map((c, idx) => ({
        index: idx,
        char: c.char,
        ornamentIndicator: c.ornamentIndicator
      }))
    };
  });

  console.log('\n=== 1. DOCUMENT MODEL ===');
  console.log('Cells in document:');
  docModel.cells.forEach(c => {
    console.log(`  [${c.index}] char="${c.char}" ornamentIndicator=${JSON.stringify(c.ornamentIndicator)}`);
  });

  // 2. DISPLAY LIST (from app.editor.displayList)
  const displayList = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return app.editor.displayList;
  });

  console.log('\n=== 2. DISPLAY LIST (JavaScript) ===');
  console.log('Lines:', displayList.lines.length);
  if (displayList.lines[0]) {
    console.log('Line 0 cells:');
    displayList.lines[0].cells.forEach((c, idx) => {
      console.log(`  [${idx}] char="${c.char}" x=${c.x} cellIndex=${c.cellIndex} dataset=${JSON.stringify(c.dataset)}`);
    });
    if (displayList.lines[0].ornaments) {
      console.log('Line 0 ornaments:', displayList.lines[0].ornaments.length);
    }
  }

  // 3. HTML DOM STRUCTURE
  const htmlStructure = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const editorEl = document.querySelector('[data-testid="editor-root"]');

    // Find all cell elements
    const cellElements = Array.from(editorEl.querySelectorAll('[data-cell-index]'));

    return cellElements.map(el => ({
      char: el.textContent,
      dataCellIndex: el.getAttribute('data-cell-index'),
      datasetCellIndex: el.dataset.cellIndex,
      x: el.style.left || el.getAttribute('x'),
      class: el.className,
      tagName: el.tagName
    }));
  });

  console.log('\n=== 3. HTML DOM ===');
  console.log('Cell elements in DOM:');
  htmlStructure.forEach((el, idx) => {
    console.log(`  DOM[${idx}] char="${el.char}" data-cell-index="${el.dataCellIndex}" dataset.cellIndex="${el.datasetCellIndex}" x="${el.x}"`);
  });

  // 4. NAVIGABLE STOPS (from getNavigableStops)
  const navStops = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();

    // Call getNavigableStops directly
    const stops = app.editor.getNavigableStops();

    return stops.map(stop => ({
      x: stop.x,
      cellIndex: stop.cellIndex,
      char: stop.char
    }));
  });

  console.log('\n=== 4. NAVIGABLE STOPS ===');
  console.log('Stops returned from getNavigableStops:');
  navStops.forEach((stop, idx) => {
    console.log(`  Stop[${idx}] x=${stop.x} cellIndex=${stop.cellIndex} char="${stop.char}"`);
  });

  // 5. DISPLAY LIST TAB (WASM output)
  await openTab(page, 'tab-displaylist');
  const displayListText = await readPaneText(page, 'pane-displaylist');

  console.log('\n=== 5. DISPLAY LIST TAB (WASM JSON) ===');
  console.log(displayListText);

  // 6. BROWSER CONSOLE LOGS
  console.log('\n=== 6. BROWSER CONSOLE LOGS ===');
  consoleLogs.forEach(log => console.log(log));

  // Basic sanity checks
  expect(docModel.cells.length).toBe(5); // h, e, l, l, o
  expect(docModel.cells.map(c => c.char).join('')).toBe('hello');
});
