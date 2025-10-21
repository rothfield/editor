import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor, waitForEditorReady } from '../utils/editor.helpers';

test('Tala persists in document and appears in layout', async ({ editorPage: page }) => {
  await waitForEditorReady(page);

  // Type content with barlines
  await typeInEditor(page, "1 | 2 | 3", { delay: 30 });
  await page.waitForTimeout(500);

  // Click on "Line" menu item first
  const lineItem = page.locator('#menu-line, [data-action="line"]');
  await lineItem.click();
  await page.waitForTimeout(300);

  // Click on "Set Tala" menu item
  const setTalaItem = page.locator('#menu-set-tala, [data-action="set-tala"]');

  // Handle the prompt dialog BEFORE clicking (to avoid race condition)
  page.once('dialog', async dialog => {
    console.log('Dialog appeared:', dialog.message());
    await dialog.type('123');
    await dialog.accept();
  });

  await setTalaItem.click();
  await page.waitForTimeout(1000);

  // Check document has tala
  const docTala = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const lineIdx = app?.editor?.getCurrentStave?.() || 0;
    return app?.editor?.theDocument?.lines?.[lineIdx]?.tala;
  });
  console.log('Document tala:', docTala);
  expect(docTala).toBe('123');

  await page.waitForTimeout(500);

  // Get layout and check tala
  const layout = await page.evaluate(() => {
    const tabPanel = document.querySelector('[data-tab-content="layout"]');
    const pre = tabPanel?.querySelector('pre');
    return pre?.textContent ? JSON.parse(pre.textContent) : null;
  });

  console.log('Layout line 0 tala count:', layout.lines[0].tala?.length || 0);
  if (layout.lines[0].tala && layout.lines[0].tala.length > 0) {
    console.log('Tala items:', layout.lines[0].tala.map(t => t.text).join(', '));
    layout.lines[0].tala.forEach(t => {
      console.log(`  - text: "${t.text}", x: ${t.x}, y: ${t.y}`);
    });
  }

  // Verify tala appears in layout
  expect(layout.lines[0].tala).toBeDefined();
  expect(layout.lines[0].tala.length).toBeGreaterThan(0);
  expect(layout.lines[0].tala[0].text).toBe('1');
});
