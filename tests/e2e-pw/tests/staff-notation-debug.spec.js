import { test, expect } from '@playwright/test';

test('DEBUG: Check if renderStaffNotation is actually being called and what it does', async ({ page }) => {
  await page.goto('/');

  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
    if (msg.text().includes('OSMD') || msg.text().includes('render')) {
      console.log('[Browser]', msg.text());
    }
  });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial notation
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(500);

  console.log('\n=== INITIAL STATE ===');
  console.log('Typed: C-- D');

  // Get initial HTML
  const staffNotationContainer = page.locator('#staff-notation-container');
  const initialHtml = await staffNotationContainer.innerHTML();
  console.log('Initial SVG length:', initialHtml.length);

  // Switch to lilypond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(300);
  console.log('\n=== SWITCHED TO LILYPOND TAB ===');

  // Modify notation while away
  console.log('\n=== MODIFYING NOTATION (while on lilypond tab) ===');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' E F G');
  await page.waitForTimeout(300);

  // Switch back to staff notation
  console.log('\n=== SWITCHING BACK TO STAFF NOTATION TAB ===');
  const staffNotationTab = page.locator('[data-tab="staff-notation"]');
  await staffNotationTab.click();
  await page.waitForTimeout(1000); // Wait longer for any render

  // Check what happened
  const updatedHtml = await staffNotationContainer.innerHTML();
  console.log('Updated SVG length:', updatedHtml.length);
  console.log('SVGs are identical?', updatedHtml === initialHtml);

  // Check console logs for OSMD messages
  console.log('\n=== OSMD CONSOLE MESSAGES ===');
  const osmdMessages = consoleLogs.filter(log => log.includes('OSMD') || log.includes('render'));
  osmdMessages.forEach(msg => console.log(msg));

  // Also check the page's internal state
  console.log('\n=== CHECKING RENDERER STATE ===');
  const rendererState = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    if (!app || !app.editor || !app.editor.osmdRenderer) {
      return 'Renderer not found';
    }
    const renderer = app.editor.osmdRenderer;
    return {
      lastMusicXmlHash: renderer.lastMusicXmlHash,
      renderToken: renderer.renderToken,
      hasOsmd: !!renderer.osmd
    };
  });
  console.log('Renderer state:', rendererState);

  // Check the actual document content
  console.log('\n=== DOCUMENT CONTENT ===');
  const docContent = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.theDocument;
    if (!doc) return 'No document';
    // Return a summary of the document
    return {
      hasInstruments: !!doc.instruments,
      measureCount: doc.measures?.length || 0,
      cellCount: doc.cells?.length || 0,
      totalCells: (doc.cells || []).length
    };
  });
  console.log('Document summary:', docContent);

  expect(updatedHtml).not.toEqual(initialHtml);
});
