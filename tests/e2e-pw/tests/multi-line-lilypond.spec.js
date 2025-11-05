import { test, expect } from '@playwright/test';

/**
 * Test to verify that each Line in the document becomes a separate staff in LilyPond output
 */
test('LilyPond output creates separate staves for multiple lines', async ({ page }) => {
  await page.goto('/');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type musical content on first line
  await editor.click();
  await page.keyboard.type('S r G |');

  // Press Enter to create a new line
  await page.keyboard.press('Enter');

  // Type musical content on second line
  await page.keyboard.type('P D n |');

  // Wait a bit for the render to complete
  await page.waitForTimeout(500);

  // Verify document has 2 lines
  const docInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.theDocument?.lines?.length || 0;
  });
  expect(docInfo, 'Document should have 2 lines').toBe(2);

  // Verify MusicXML has 2 parts
  const musicXML = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.wasmModule?.exportMusicXML(app.editor.theDocument);
  });
  const partCount = (musicXML.match(/<part /g) || []).length;
  expect(partCount, 'MusicXML should have 2 <part> elements').toBe(2);

  // Click on LilyPond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Read LilyPond output
  const lilypondPane = page.getByTestId('pane-lilypond');
  await expect(lilypondPane).toBeVisible();
  await expect.poll(async () => (await lilypondPane.innerText()).trim()).not.toEqual('');

  const lilypondOutput = await lilypondPane.innerText();

  // Verify that we have 2 \new Staff blocks (one for each line)
  const staffMatches = lilypondOutput.match(/\\new Staff/g);
  expect(staffMatches, 'LilyPond should have 2 staff blocks').toHaveLength(2);

  // Verify it uses MultiStave template (ChoirStaff wrapper)
  expect(lilypondOutput, 'LilyPond should use ChoirStaff for multiple staves')
    .toContain('\\new ChoirStaff');
});
