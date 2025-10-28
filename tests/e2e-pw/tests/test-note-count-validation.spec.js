import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Note count validation: Input cells = Output notes', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Test case 1: Simple F GA C
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  
  await page.keyboard.type('F GA C');
  await page.waitForTimeout(300);

  // Get cell count
  let cellInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const line = app.editor.theDocument.lines[0];
    
    // Count pitched (non-whitespace) cells
    const pitchedCells = line.cells.filter(c => c.kind.name === 'pitched_element');
    
    return {
      totalCells: line.cells.length,
      pitchedCells: pitchedCells.length,
      cells: line.cells.map((c, i) => ({
        index: i,
        char: c.char,
        kind: c.kind.name,
        isOrnament: c.ornament_indicator && c.ornament_indicator.name !== 'none'
      }))
    };
  });

  console.log('INPUT - Cell Info:');
  console.log(`Total cells: ${cellInfo.totalCells}`);
  console.log(`Pitched cells: ${cellInfo.pitchedCells}`);
  cellInfo.cells.forEach(c => {
    console.log(`  [${c.index}] '${c.char}' (${c.kind}) ornament=${c.isOrnament}`);
  });

  // Check MusicXML export
  await openTab(page, 'tab-musicxml');
  const musicxml = await readPaneText(page, 'pane-musicxml');

  // Count all <note> elements
  const noteMatches = musicxml.match(/<note>/g) || [];
  const graceMatches = musicxml.match(/<grace/g) || [];
  const mainNotes = noteMatches.length - graceMatches.length;

  console.log('\nOUTPUT - MusicXML Note Count:');
  console.log(`Total <note> elements: ${noteMatches.length}`);
  console.log(`Grace notes: ${graceMatches.length}`);
  console.log(`Main notes: ${mainNotes}`);
  
  console.log('\nMusicXML:');
  console.log(musicxml.substring(0, 500));

  // VALIDATION: Expected counts
  // For "F GA C": 
  //   - 3 pitched cells (F, G, A, C) 
  //   - Should output: 2 main (F, C) + 2 grace (G, A) = 4 notes
  
  expect(cellInfo.pitchedCells).toBe(4); // F, G, A, C
  expect(noteMatches.length).toBe(4);    // 4 notes total
  expect(graceMatches.length).toBe(2);   // 2 grace notes
  expect(mainNotes).toBe(2);              // 2 main notes
});
