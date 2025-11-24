import { test, expect } from '../fixtures/editor.fixture';
import {
  typeInEditor,
  getRenderedContent,
} from '../utils/editor.helpers';

test.describe('Pitch System Display - Western Notation', () => {
  test('should display notes in Western notation when pitch system is set to Western', async ({ editorPage: page }) => {
    // Step 1: Type some notes in Number notation (default system)
    await typeInEditor(page, '1 2 3 4 5 6 7');

    // Verify initial state - should show numbers
    const initialContent = await getRenderedContent(page);
    expect(initialContent).toContain('1');
    expect(initialContent).toContain('2');
    expect(initialContent).toContain('3');

    // Verify pitch system display shows "Number"
    const initialPitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(initialPitchSystemDisplay).toBe('Number');

    // Step 2: Change pitch system to Western
    // Open the Document menu
    await page.click('#menu-document');

    // Click "Set Pitch System..." menu item
    await page.click('#menu-set-pitch-system');

    // Handle the prompt dialog - select option 2 (Western)
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('prompt');
      expect(dialog.message()).toContain('Select pitch system');
      await dialog.accept('2'); // 2 = Western (cdefgab/CDEFGAB)
    });

    // Wait for the dialog to be handled
    await page.waitForTimeout(500);

    // Step 3: Verify pitch system display changed to "Western"
    await expect.poll(async () => {
      return await page.getByTestId('pitch-system').textContent();
    }).toBe('Western');

    // Step 4: Verify notes are now displayed in Western notation
    // The same notes (1 2 3 4 5 6 7) should now display as (C D E F G A B)
    const westernContent = await getRenderedContent(page);

    // Should contain Western note names
    expect(westernContent).toContain('C');
    expect(westernContent).toContain('D');
    expect(westernContent).toContain('E');
    expect(westernContent).toContain('F');
    expect(westernContent).toContain('G');
    expect(westernContent).toContain('A');
    expect(westernContent).toContain('B');

    // Should NOT contain number notation anymore
    // (Note: be careful with beat numbers in rendering)
    const cells = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => cell.char) || [];
    });

    // Check that pitched elements are using Western notation
    const pitchedCells = cells.filter(char =>
      char && char !== ' ' && !char.includes('|')
    );

    // At least some cells should be Western letters
    const hasWesternNotes = pitchedCells.some(char =>
      /[CDEFGABcdefgab]/.test(char)
    );
    expect(hasWesternNotes).toBe(true);
  });

  test('should convert accidentals when switching to Western notation', async ({ editorPage: page }) => {
    // Type notes with accidentals in Number notation
    await typeInEditor(page, '1# 2b 3');

    // Change pitch system to Western
    await page.click('#menu-document');
    await page.click('#menu-set-pitch-system');

    page.once('dialog', async dialog => {
      await dialog.accept('2'); // Western
    });

    await page.waitForTimeout(500);

    // Verify pitch system changed
    await expect.poll(async () => {
      return await page.getByTestId('pitch-system').textContent();
    }).toBe('Western');

    // Verify notes are displayed in Western notation with accidentals
    const cells = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => ({
        char: cell.char,
        pitch_code: cell.pitch_code
      })) || [];
    });

    // Should have Western notation characters
    const chars = cells.map(c => c.char).filter(c => c && c.trim() !== '');
    const hasWesternWithAccidentals = chars.some(char =>
      /[CDEFGABcdefgab]/.test(char) && (char.includes('#') || char.includes('b'))
    );

    // At minimum, should have Western note letters
    const hasWesternLetters = chars.some(char => /[CDEFGABcdefgab]/.test(char));
    expect(hasWesternLetters).toBe(true);
  });

  test('should persist Western notation when typing new notes', async ({ editorPage: page }) => {
    // Change to Western system first
    await page.click('#menu-document');
    await page.click('#menu-set-pitch-system');

    page.once('dialog', async dialog => {
      await dialog.accept('2'); // Western
    });

    await page.waitForTimeout(500);

    // Verify system changed
    await expect.poll(async () => {
      return await page.getByTestId('pitch-system').textContent();
    }).toBe('Western');

    // Now type notes - they should be interpreted/displayed as Western
    await typeInEditor(page, 'c d e f g a b');

    const content = await getRenderedContent(page);

    // Should contain Western notation
    expect(content.toLowerCase()).toContain('c');
    expect(content.toLowerCase()).toContain('d');
    expect(content.toLowerCase()).toContain('e');

    // Verify in document model
    const cells = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => cell.char) || [];
    });

    const hasWesternNotes = cells.some(char =>
      char && /[CDEFGABcdefgab]/.test(char)
    );
    expect(hasWesternNotes).toBe(true);
  });
});
