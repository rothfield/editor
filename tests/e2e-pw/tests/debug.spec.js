import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Debug: DOM Structure', () => {
  test('should show DOM structure after text input', async ({ editorPage: page }) => {
    // Type some text
    await typeInEditor(page, '1234567');

    // Wait a bit for rendering
    await page.waitForTimeout(500);

    // Get all the DOM info we can
    const domInfo = await page.evaluate(() => {
      const editor = document.getElementById('notation-editor');

      return {
        editorHTML: editor?.innerHTML.substring(0, 500),
        charCellCount: document.querySelectorAll('.char-cell').length,
        charCellTexts: Array.from(document.querySelectorAll('.char-cell')).map(el => ({
          class: el.className,
          text: el.textContent,
          html: el.innerHTML.substring(0, 100)
        })).slice(0, 10),
        notationLineContent: document.querySelector('.notation-line')?.textContent,
        windowMusicEditor: typeof window.MusicNotationApp
      };
    });

    console.log('DOM Info:', JSON.stringify(domInfo, null, 2));

    // Log to the test output
    expect(domInfo.charCellCount).toBeGreaterThan(0);
  });

  test('should show app state', async ({ editorPage: page }) => {
    await typeInEditor(page, 'test');
    await page.waitForTimeout(300);

    const appState = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return {
        appExists: !!app,
        editorExists: !!app?.editor,
        documentExists: !!app?.editor?.theDocument,
        documentLines: app?.editor?.theDocument?.lines?.length,
        lineData: app?.editor?.theDocument?.lines?.[0]
      };
    });

    console.log('App State:', JSON.stringify(appState, null, 2));
    expect(appState.appExists).toBe(true);
  });
});
