import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor, waitForEditorReady } from '../utils/editor.helpers';

test('Tala set via WASM appears in layout', async ({ editorPage: page }) => {
  await waitForEditorReady(page);

  // Type content with barlines
  await typeInEditor(page, "1 | 2 | 3", { delay: 30 });
  await page.waitForTimeout(500);

  // Set tala directly via WASM
  const result = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const currentStave = app?.editor?.getCurrentStave?.() || 0;

    console.log('Before: line[0].tala =', app?.editor?.theDocument?.lines?.[0]?.tala);
    console.log('Before: line[1].tala =', app?.editor?.theDocument?.lines?.[1]?.tala);

    // Call WASM to set tala
    const updatedDoc = app?.editor?.wasmModule?.setLineTala?.(
      app.editor.theDocument,
      currentStave,
      '123'
    );

    if (updatedDoc && updatedDoc.then) {
      return updatedDoc.then(doc => {
        app.editor.theDocument = doc;
        console.log('After: line[0].tala =', doc.lines?.[0]?.tala);
        console.log('After: line[1].tala =', doc.lines?.[1]?.tala);
        return doc;
      });
    }
    return updatedDoc;
  });

  await page.waitForTimeout(500);

  // Render to update layout
  await page.evaluate(() => {
    return window.MusicNotationApp?.app()?.editor?.render?.();
  });

  await page.waitForTimeout(500);

  // Get layout
  const layout = await page.evaluate(() => {
    const tabPanel = document.querySelector('[data-tab-content="layout"]');
    const pre = tabPanel?.querySelector('pre');
    return pre?.textContent ? JSON.parse(pre.textContent) : null;
  });

  console.log('Line 0 tala:', layout.lines[0].tala);
  console.log('Line 0 cells:', layout.lines[0].cells.map(c => c.char).join(''));

  // Verify
  expect(layout.lines[0].tala).toBeDefined();
  expect(layout.lines[0].tala.length).toBeGreaterThan(0);
  expect(layout.lines[0].tala[0].text).toBe('1');
});
