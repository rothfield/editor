import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Toggle Octave on Cursor (No Selection)', () => {
  test('Toggle octave should work on cell at cursor without selection', async ({ editorPage: page }) => {
    // Type "123"
    await typeInEditor(page, '123');
    await page.waitForTimeout(300);

    // Position cursor after "1" (between 1 and 2)
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Check there's no selection
    const hasSelection = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.hasSelection();
    });
    expect(hasSelection).toBe(false);

    // Toggle octave +1 (should work on cell "1")
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app?.editor?.toggleOctave(1);
    });
    await page.waitForTimeout(300);

    // Check that cell "1" now has octave +1
    const cellState = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      const cells = line?.cells || [];
      return {
        cell0: { char: cells[0]?.char, octave: cells[0]?.octave },
        cell1: { char: cells[1]?.char, octave: cells[1]?.octave },
        cell2: { char: cells[2]?.char, octave: cells[2]?.octave }
      };
    });

    console.log('Cell states after toggle:', cellState);

    // Cell 0 (char "1") should have octave +1
    expect(cellState.cell0.octave).toBe(1);
    // Other cells should still have octave 0
    expect(cellState.cell1.octave).toBe(0);
    expect(cellState.cell2.octave).toBe(0);
  });

  test('Toggle octave at start of document (cursor at position 0)', async ({ editorPage: page }) => {
    // Type "123" (pitched elements, not text)
    await typeInEditor(page, '123');
    await page.waitForTimeout(300);

    // Position cursor at start
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // Verify cursor is at position 0
    const cursorPos = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.getCursorPosition();
    });
    expect(cursorPos).toBe(0);

    // Toggle octave -1 (should work on first cell "1")
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app?.editor?.toggleOctave(-1);
    });
    await page.waitForTimeout(300);

    // Check that first cell has octave -1
    const firstCellOctave = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      return line?.cells?.[0]?.octave;
    });

    console.log('First cell octave:', firstCellOctave);
    expect(firstCellOctave).toBe(-1);
  });

  test('Toggle octave in middle of document', async ({ editorPage: page }) => {
    // Type "12345"
    await typeInEditor(page, '12345');
    await page.waitForTimeout(300);

    // Position cursor after "3" (between 3 and 4)
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }

    // Verify cursor position
    const cursorPos = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.getCursorPosition();
    });
    console.log('Cursor position:', cursorPos);

    // Toggle octave +1 (should work on cell "3")
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app?.editor?.toggleOctave(1);
    });
    await page.waitForTimeout(300);

    // Check that only cell "3" has octave +1
    const cellOctaves = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      const cells = line?.cells || [];
      return cells.map((c, i) => ({ index: i, char: c.char, octave: c.octave }));
    });

    console.log('All cell octaves:', cellOctaves);

    // Find the cell with char "3" (should be at index 2)
    const cell3 = cellOctaves.find(c => c.char === '3');
    expect(cell3?.octave).toBe(1);

    // Other cells should have octave 0
    cellOctaves.forEach(c => {
      if (c.char !== '3') {
        expect(c.octave).toBe(0);
      }
    });
  });

  test('Toggle octave should NOT affect selection when there is one', async ({ editorPage: page }) => {
    // Type "123"
    await typeInEditor(page, '123');
    await page.waitForTimeout(300);

    // Select cells 0-1 (chars "1" and "2")
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(300);

    // Verify selection exists
    const hasSelection = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.hasSelection();
    });
    expect(hasSelection).toBe(true);

    // Toggle octave +1 (should work on selected cells)
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app?.editor?.toggleOctave(1);
    });
    await page.waitForTimeout(300);

    // Check that selected cells have octave +1
    const cellOctaves = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      const cells = line?.cells || [];
      return cells.map(c => c.octave);
    });

    console.log('Cell octaves after selection toggle:', cellOctaves);

    // First two cells should have octave +1
    expect(cellOctaves[0]).toBe(1);
    expect(cellOctaves[1]).toBe(1);
    // Third cell should still be 0
    expect(cellOctaves[2]).toBe(0);
  });
});
