import { test, expect } from '@playwright/test';

/**
 * Test to verify that single-line documents still work correctly (regression test)
 */
test('Single-line document creates one staff in LilyPond output', async ({ page }) => {
  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type musical content on one line
  await editor.click();
  await page.keyboard.type('S r G m P |');

  // Wait a bit for the render to complete
  await page.waitForTimeout(500);

  // Verify document has 1 line
  const docInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.theDocument?.lines?.length || 0;
  });
  expect(docInfo, 'Document should have 1 line').toBe(1);

  // Verify MusicXML has 1 part
  const musicXML = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.wasmModule?.exportMusicXML(app.editor.theDocument);
  });
  const partCount = (musicXML.match(/<part /g) || []).length;
  expect(partCount, 'MusicXML should have 1 <part> element').toBe(1);

  // Click on LilyPond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Read LilyPond output
  const lilypondPane = page.getByTestId('pane-lilypond');
  await expect(lilypondPane).toBeVisible();
  await expect.poll(async () => (await lilypondPane.innerText()).trim()).not.toEqual('');

  const lilypondOutput = await lilypondPane.innerText();

  // Verify that we have 1 \new Staff block
  const staffMatches = lilypondOutput.match(/\\new Staff/g);
  expect(staffMatches, 'LilyPond should have 1 staff block').toHaveLength(1);

  // Verify it does NOT use ChoirStaff (only for multiple staves)
  expect(lilypondOutput, 'LilyPond should NOT use ChoirStaff for single staff')
    .not.toContain('\\new ChoirStaff');
});
