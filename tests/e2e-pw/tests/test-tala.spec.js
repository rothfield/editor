import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor, waitForEditorReady } from '../utils/editor.helpers';

test('Tala is saved to document and appears in layout', async ({ editorPage: page }) => {
  await waitForEditorReady(page);

  // Type some content with barlines
  await typeInEditor(page, "1 | 2 | 3", { delay: 30 });
  await page.waitForTimeout(500);

  // Get initial tala value
  let initialTala = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const lineIdx = app?.editor?.getCurrentStave?.() || 0;
    return app?.editor?.theDocument?.lines?.[lineIdx]?.tala || '';
  });
  console.log('Initial tala:', initialTala);

  // Simulate Alt+T to open setTala
  await page.keyboard.press('Alt+T');
  await page.waitForTimeout(500);

  // Check if prompt appears and handle it
  page.once('dialog', async dialog => {
    console.log('Dialog appeared:', dialog.message());
    await dialog.type('123');
    await dialog.accept();
  });

  await page.waitForTimeout(1000);

  // Check document tala value
  const talaAfterSet = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const lineIdx = app?.editor?.getCurrentStave?.() || 0;
    const tala = app?.editor?.theDocument?.lines?.[lineIdx]?.tala;
    console.log(`Line[${lineIdx}].tala =`, tala);
    return tala;
  });
  console.log('Tala after setTala:', talaAfterSet);

  // Check layout tab for tala
  const layout = await page.evaluate(() => {
    const tabPanel = document.querySelector('[data-tab-content="layout"]');
    const pre = tabPanel?.querySelector('pre');
    return pre?.textContent ? JSON.parse(pre.textContent) : null;
  });

  console.log('Layout lines:');
  layout.lines.forEach((line, idx) => {
    console.log(`Line ${idx}: tala_count=${line.tala ? line.tala.length : 0}`);
    if (line.tala && line.tala.length > 0) {
      line.tala.forEach(talaItem => {
        console.log(`  - text: "${talaItem.text}", x: ${talaItem.x}, y: ${talaItem.y}`);
      });
    }
  });

  // Verify tala is in the layout
  expect(layout.lines[0].tala).toHaveLength(3);
  expect(layout.lines[0].tala[0].text).toBe('1');
  expect(layout.lines[0].tala[1].text).toBe('2');
  expect(layout.lines[0].tala[2].text).toBe('3');

  // Verify tala Y positions are correct
  expect(layout.lines[0].tala[0].y).toBeGreaterThan(0);
});
