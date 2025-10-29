import { test, expect } from '@playwright/test';

test('DEBUG: Check if document is updated when typing on non-staff-notation tab', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial notation
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(300);

  // Get initial document state
  const initialDoc = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = JSON.stringify(app?.editor?.theDocument);
    return doc;
  });

  console.log('Initial doc length:', initialDoc.length);

  // Switch to lilypond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(300);

  console.log('\n=== SWITCHED TO LILYPOND TAB ===');

  // Type more notation while on lilypond tab
  console.log('Typing more notation: " E F G"');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' E F G');
  await page.waitForTimeout(500);

  // Get updated document state
  const updatedDoc = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = JSON.stringify(app?.editor?.theDocument);
    return doc;
  });

  console.log('Updated doc length:', updatedDoc.length);
  console.log('Documents are identical?', updatedDoc === initialDoc);

  if (updatedDoc === initialDoc) {
    console.log('\n❌ BUG CONFIRMED: Document was NOT updated while on lilypond tab!');
  } else {
    console.log('\n✓ Document WAS updated while on lilypond tab');
    // Now export MusicXML to see if it reflects the changes
    const musicxml = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app?.editor?.wasmModule?.exportMusicXML(app.editor.theDocument);
    });
    console.log('Exported MusicXML length:', musicxml?.length || 'N/A');
  }

  expect(updatedDoc).not.toEqual(initialDoc);
});
