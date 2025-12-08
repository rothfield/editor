import { test, expect } from '@playwright/test';

test('Number pitch system with tonic D should transpose in IR', async ({ page }) => {
  await page.goto('/');

  await page.waitForFunction(
    () => typeof window.editor !== 'undefined',
    { timeout: 15000 }
  );

  const editor = page.locator('[data-testid="editor-root"]');
  await editor.click();

  // Set pitch system to Number (1 = Number system)
  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentPitchSystem(1);
  });

  // Set tonic to D
  await page.evaluate(() => {
    window.editor.wasmModule.setDocumentTonic('D');
  });

  await page.evaluate(() => window.editor.renderAndUpdate());

  // Type the input
  await page.keyboard.type('1 2 3');

  // Render and get IR output
  await page.evaluate(() => window.editor.renderAndUpdate());

  const irTab = page.getByTestId('tab-ir');
  if (await irTab.isVisible()) {
    await irTab.click();

    const irPane = page.getByTestId('pane-ir');
    await expect(irPane).toBeVisible();

    const irContent = await irPane.innerText();
    console.log('IR output (first 1000 chars):\n', irContent.substring(0, 1000));

    // Parse IR JSON
    const irJson = JSON.parse(irContent);

    // Get the notes from the IR
    const notes = [];
    if (irJson[0] && irJson[0].measures && irJson[0].measures[0] && irJson[0].measures[0].events) {
      for (const event of irJson[0].measures[0].events) {
        if (event.Note) {
          notes.push(event.Note.pitch.pitch_code);
        }
      }
    }

    console.log('Pitch codes in IR:', notes);

    // With tonic D and number system:
    // Input: 1 2 3 (scale degrees in user input)
    // Tonic D means we use D major scale: D E F# G A B C#
    //
    // Transposition preserves pitch_code (user input) but adds western_pitch (transposed spelling):
    // - Degree 1 + tonic D = western_pitch "D"
    // - Degree 2 + tonic D = western_pitch "E"
    // - Degree 3 + tonic D = western_pitch "Fs" (F#)

    expect(notes.length).toBe(3, 'Should have 3 notes');

    // pitch_code stays as user input (N1, N2, N3)
    expect(irContent).toContain('"pitch_code": "N1"');
    expect(irContent).toContain('"pitch_code": "N2"');
    expect(irContent).toContain('"pitch_code": "N3"');

    // western_pitch shows transposed spelling in D major
    expect(irContent).toContain('"western_pitch": "D"');
    expect(irContent).toContain('"western_pitch": "E"');
    expect(irContent).toContain('"western_pitch": "Fs"');

    // tonic field is preserved
    expect(irContent).toContain('"tonic": "D"');

    console.log('✅ Tonic-aware transposition: pitch_code=N1,N2,N3 → western_pitch=D,E,F# in tonic D');
  }
});
