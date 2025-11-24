import { test, expect } from '../fixtures/editor.fixture';
import {
  clearEditor,
  typeInEditor,
  getRenderedContent,
} from '../utils/editor.helpers';

test.describe('Western Notation - Simple Display Test', () => {
  test('should display "C" when typing "c" in Western notation system', async ({ editorPage: page }) => {
    // Step 1: Clear editor to start fresh
    await clearEditor(page);

    // Step 2: Set pitch system to Western
    // Open the File menu
    await page.click('#file-menu-button');

    // Click "Set Pitch System..." menu item
    await page.click('#menu-set-pitch-system');

    // Handle the prompt dialog - select option 2 (Western)
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('prompt');
      expect(dialog.message()).toContain('Select pitch system');
      await dialog.accept('2'); // 2 = Western (cdefgab/CDEFGAB)
    });

    // Wait for the system to update
    await page.waitForTimeout(500);

    // Step 3: Verify pitch system display shows "Western"
    const pitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(pitchSystemDisplay).toBe('Western');

    // Step 4: Type 'c' in the editor
    await typeInEditor(page, 'c');

    // Step 5: Verify that 'C' (uppercase) is displayed
    const content = await getRenderedContent(page);
    expect(content).toContain('C');

    // Step 6: Verify in the document model that the cell contains 'C'
    const cells = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => cell.char) || [];
    });

    // Should have at least one cell with 'C'
    const hasUppercaseC = cells.some(char => char === 'C');
    expect(hasUppercaseC).toBe(true);
  });

  test('should display Western notation for full scale', async ({ editorPage: page }) => {
    // Clear and set to Western
    await clearEditor(page);
    await page.click('#file-menu-button');
    await page.click('#menu-set-pitch-system');

    page.once('dialog', async dialog => {
      await dialog.accept('2'); // Western
    });

    await page.waitForTimeout(500);

    // Verify system changed
    const pitchSystemDisplay = await page.getByTestId('pitch-system').textContent();
    expect(pitchSystemDisplay).toBe('Western');

    // Type Western scale: c d e f g a b
    await typeInEditor(page, 'c d e f g a b');

    // Verify all notes are displayed in uppercase Western notation
    const cells = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => cell.char).filter(c => c && c.trim() !== '') || [];
    });

    // Should contain Western note letters (uppercase)
    const westernNotes = cells.filter(char => /[CDEFGAB]/.test(char));
    expect(westernNotes.length).toBeGreaterThan(0);

    // Specifically check for each note
    const content = await getRenderedContent(page);
    expect(content).toContain('C');
    expect(content).toContain('D');
    expect(content).toContain('E');
    expect(content).toContain('F');
    expect(content).toContain('G');
    expect(content).toContain('A');
    expect(content).toContain('B');
  });

  test('should display Western notation with accidentals', async ({ editorPage: page }) => {
    // Clear and set to Western
    await clearEditor(page);
    await page.click('#file-menu-button');
    await page.click('#menu-set-pitch-system');

    page.once('dialog', async dialog => {
      await dialog.accept('2'); // Western
    });

    await page.waitForTimeout(500);

    // Type notes with sharps and flats
    await typeInEditor(page, 'c# db e');

    // Verify Western notation with accidentals
    const cells = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const doc = app?.editor?.getDocument?.();
      return doc?.lines?.[0]?.cells?.map(cell => cell.char).filter(c => c && c.trim() !== '') || [];
    });

    // Should have C#
    const hasCSharp = cells.some(char => char && char.includes('C') && char.includes('#'));
    expect(hasCSharp).toBe(true);

    // Should have Db (or D with flat)
    const hasDFlat = cells.some(char => char && char.includes('D') && char.includes('b'));
    expect(hasDFlat).toBe(true);

    // Should have E
    const hasE = cells.some(char => char === 'E');
    expect(hasE).toBe(true);
  });
});
