import { test, expect } from '@playwright/test';

test('DEBUG: Check exportMusicXML output before and after document change', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type initial notation
  await editor.click();
  await page.keyboard.type('C-- D');
  await page.waitForTimeout(300);

  // Export initial MusicXML
  const initialMusicXML = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const xml = app?.editor?.wasmModule?.exportMusicXML(app.editor.theDocument);
    return xml;
  });

  console.log('Initial MusicXML length:', initialMusicXML.length);
  console.log('Initial MusicXML (first 200 chars):', initialMusicXML.substring(0, 200));

  // Switch to lilypond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await lilypondTab.click();
  await page.waitForTimeout(300);

  // Type more notation while on lilypond tab
  console.log('\n=== Typing more notation: " E F G" ===');
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' E F G');
  await page.waitForTimeout(500);

  // Export MusicXML after change
  const updatedMusicXML = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const xml = app?.editor?.wasmModule?.exportMusicXML(app.editor.theDocument);
    return xml;
  });

  console.log('\nUpdated MusicXML length:', updatedMusicXML.length);
  console.log('Updated MusicXML (first 200 chars):', updatedMusicXML.substring(0, 200));

  console.log('\n=== COMPARISON ===');
  console.log('MusicXMLs are identical?', updatedMusicXML === initialMusicXML);
  console.log('Initial length:', initialMusicXML.length);
  console.log('Updated length:', updatedMusicXML.length);

  if (updatedMusicXML === initialMusicXML) {
    console.log('\n❌ BUG CONFIRMED: exportMusicXML() returns the SAME MusicXML even though document changed!');
  } else {
    console.log('\n✓ exportMusicXML() correctly exports different MusicXML for updated document');
  }

  // Now check what happens when we switch back to staff notation
  console.log('\n=== SWITCHING BACK TO STAFF NOTATION ===');
  const staffNotationTab = page.locator('[data-tab="staff-notation"]');
  await staffNotationTab.click();
  await page.waitForTimeout(500);

  // Export again to see if it's the same as the updated one
  const finalMusicXML = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const xml = app?.editor?.wasmModule?.exportMusicXML(app.editor.theDocument);
    return xml;
  });

  console.log('Final MusicXML length:', finalMusicXML.length);
  console.log('Final === Updated?', finalMusicXML === updatedMusicXML);

  expect(updatedMusicXML).not.toEqual(initialMusicXML);
});
