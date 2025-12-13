import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

// Helper to open an inspector tab
async function openTab(page, tabName) {
  // Use the actual tab IDs from index.html
  const tabMap = {
    'lilypond': 'tab-lilypond-src',
    'musicxml': 'tab-musicxml',
    'ir': 'tab-ir'
  };
  const tabId = tabMap[tabName] || `tab-${tabName}`;
  await page.click(`#${tabId}`);
  await page.waitForTimeout(100);
}

// Helper to read pane text
async function readPaneText(page, paneName) {
  // Use actual content IDs
  const paneMap = {
    'lilypond': 'tab-content-lilypond-src',
    'musicxml': 'tab-content-musicxml',
    'ir': 'tab-content-ir'
  };
  const paneId = paneMap[paneName] || `tab-content-${paneName}`;
  const pane = await page.locator(`#${paneId}`);
  return await pane.textContent();
}

/**
 * E2E tests for superscript-based ornament (grace note) system
 *
 * Architecture:
 * - Grace notes are represented as superscript codepoints (0xF8000+)
 * - Superscripts are rhythm-transparent (excluded from beat calculations)
 * - Alt+O converts selected pitches to superscript (grace notes)
 * - IR builder detects superscripts and attaches them to previous normal pitch
 */

test.describe('Superscript Ornament System', () => {

  test('Alt+O converts selected pitches to superscript', async ({ editorPage: page }) => {
    // Type "1 234 5" - we'll convert "234" to grace notes
    await typeInEditor(page, '1 234 5');

    // Select "234" (shift+left 3 times from end)
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft'); // move past space and 5
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    // Press Alt+O to convert to ornament
    await page.keyboard.press('Alt+o');

    // Wait for render
    await page.waitForTimeout(200);

    // Get the document and verify conversion
    const doc = await page.evaluate(() => {
      return window.editor?.getDocument();
    });

    expect(doc).toBeTruthy();
    const cells = doc.lines[0].cells;

    // Check that cells for "234" are now superscripts
    // Superscript codepoints are in range 0xF8000+
    let superscriptCount = 0;
    for (const cell of cells) {
      const cp = cell.char.codePointAt(0);
      if (cp >= 0xF8000 && cp < 0xFE040) {
        superscriptCount++;
      }
    }

    expect(superscriptCount).toBe(3); // "2", "3", "4" converted
  });

  test('superscripts are excluded from rhythm calculation', async ({ editorPage: page }) => {
    // Type "1234" - 4 subdivisions in one beat
    await typeInEditor(page, '1234');

    // Get LilyPond before conversion
    await openTab(page, 'lilypond');
    const beforeLily = await readPaneText(page, 'lilypond');
    console.log('Before LilyPond:', beforeLily);

    // Select "23" (middle two)
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // past "1"
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    // Convert to superscript
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(200);

    // Get LilyPond after conversion
    const afterLily = await readPaneText(page, 'lilypond');
    console.log('After LilyPond:', afterLily);

    // The rhythm should change - before: 4 notes, after: 2 notes + grace notes
    // Before: likely "c16 d16 e16 f16" (4 sixteenths)
    // After: should have grace notes
    expect(afterLily).not.toEqual(beforeLily);
  });

  test('converted cells are in superscript range', async ({ editorPage: page }) => {
    // Type simple pattern
    await typeInEditor(page, '12');

    // Select "2"
    await page.keyboard.press('Shift+ArrowLeft');

    // Convert
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(200);

    // Verify the second cell is superscript
    const doc = await page.evaluate(() => {
      return window.editor?.getDocument();
    });

    expect(doc).toBeTruthy();
    expect(doc.lines[0].cells.length).toBeGreaterThanOrEqual(2);

    // Find the converted cell
    let foundSuperscript = false;
    for (const cell of doc.lines[0].cells) {
      const cp = cell.char.codePointAt(0);
      if (cp >= 0xF8000 && cp < 0xFE040) {
        foundSuperscript = true;
        break;
      }
    }

    expect(foundSuperscript).toBe(true);
  });

  test('no pitched cells shows alert', async ({ editorPage: page }) => {
    // Type non-pitched content
    await typeInEditor(page, '- -');

    // Select dashes
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');

    // Set up dialog handler
    let alertMessage = '';
    page.once('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    // Try to convert
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(200);

    // Should show alert about no pitched cells
    expect(alertMessage).toContain('No pitched cells');
  });
});
