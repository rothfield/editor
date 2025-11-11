import { test, expect } from '@playwright/test';

test('RHYTHM: 1 - produces tied half-note C', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for editor to be ready
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type "1 -" (pitch, space, dash)
  await editor.click();
  await page.keyboard.type('1 -');

  // Wait a bit for WASM to process
  await page.waitForTimeout(500);

  // Open MusicXML tab
  const musicxmlTab = page.getByTestId('tab-musicxml');
  await expect(musicxmlTab).toBeVisible();
  await musicxmlTab.click();

  // Read MusicXML content
  const musicxmlPane = page.getByTestId('pane-musicxml');
  await expect(musicxmlPane).toBeVisible();

  await expect.poll(async () => {
    const text = await musicxmlPane.innerText();
    return text.trim().length > 0;
  }).toBeTruthy();

  const musicxml = await musicxmlPane.innerText();

  // Verify MusicXML contains ties
  expect(musicxml).toContain('<tie type="start"/>');
  expect(musicxml).toContain('<tie type="stop"/>');

  // Should have two note elements
  const noteCount = (musicxml.match(/<note>/g) || []).length;
  expect(noteCount).toBe(2);

  console.log('MusicXML output (first 500 chars):');
  console.log(musicxml.substring(0, 500));

  // Open LilyPond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Read LilyPond content
  const lilypondPane = page.getByTestId('pane-lilypond');
  await expect(lilypondPane).toBeVisible();

  await expect.poll(async () => {
    const text = await lilypondPane.innerText();
    return text.trim().length > 0;
  }).toBeTruthy();

  const lilypond = await lilypondPane.innerText();

  // Verify LilyPond contains tied notes
  // Should show something like "c'4 ~\nc'4" for a tied half-note
  expect(lilypond).toMatch(/c'\d+\s*~\s*c'\d+/); // Tied notes with whitespace tolerance

  console.log('LilyPond output (first 500 chars):');
  console.log(lilypond.substring(0, 500));
});
