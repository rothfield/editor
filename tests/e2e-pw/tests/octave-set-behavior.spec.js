import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Octave Set Behavior (Not Toggle)', () => {
  test('Alt+U sets octave to +1 (not toggle)', async ({ editorPage: page }) => {
    // Type "123"
    await typeInEditor(page, '123');
    await page.waitForTimeout(300);

    // Select all
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(100);

    // Apply octave +1 (Alt+U)
    await page.keyboard.press('Alt+u');
    await page.waitForTimeout(300);

    // Check all cells have octave = 1
    const octaves1 = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      return line?.cells?.map(c => c.octave) || [];
    });

    console.log('After Alt+U:', octaves1);
    expect(octaves1).toEqual([1, 1, 1]);

    // Apply octave +1 AGAIN (Alt+U)
    await page.keyboard.press('Alt+u');
    await page.waitForTimeout(300);

    // Should still be 1 (not toggle to 0)
    const octaves2 = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      return line?.cells?.map(c => c.octave) || [];
    });

    console.log('After second Alt+U:', octaves2);
    expect(octaves2).toEqual([1, 1, 1]); // SHOULD NOT TOGGLE BACK TO 0

    // Apply octave 0 (Alt+M for middle)
    await page.keyboard.press('Alt+m');
    await page.waitForTimeout(300);

    const octaves3 = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      return line?.cells?.map(c => c.octave) || [];
    });

    console.log('After Alt+M:', octaves3);
    expect(octaves3).toEqual([0, 0, 0]);

    // Apply octave -1 (Alt+L for lower)
    await page.keyboard.press('Alt+l');
    await page.waitForTimeout(300);

    const octaves4 = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const line = app?.editor?.theDocument?.lines?.[0];
      return line?.cells?.map(c => c.octave) || [];
    });

    console.log('After Alt+L:', octaves4);
    expect(octaves4).toEqual([-1, -1, -1]);
  });

  test('Octave setting updates display characters (glyphs)', async ({ editorPage: page }) => {
    // Type "1"
    await typeInEditor(page, '1');
    await page.waitForTimeout(300);

    // Select all
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(100);

    // Get base glyph (octave 0)
    const baseChar = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const cell = app?.editor?.theDocument?.lines?.[0]?.cells?.[0];
      return { char: cell?.char, octave: cell?.octave };
    });

    console.log('Base (octave 0):', baseChar);
    expect(baseChar.octave).toBe(0);

    // Apply octave +1
    await page.keyboard.press('Alt+u');
    await page.waitForTimeout(300);

    // Get new glyph (should be different)
    const upperChar = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const cell = app?.editor?.theDocument?.lines?.[0]?.cells?.[0];
      return { char: cell?.char, octave: cell?.octave };
    });

    console.log('Upper (octave +1):', upperChar);
    expect(upperChar.octave).toBe(1);
    // Glyph should have changed (different Unicode codepoint)
    expect(upperChar.char).not.toBe(baseChar.char);
  });
});
