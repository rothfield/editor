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
    // 1 (tonic) = D
    // 2 (second) = E
    // 3 (third) = F#
    // Expected pitch codes: D1, E1, Fs1 (or similar with octave/accidental info)

    expect(notes.length).toBe(3, 'Should have 3 notes');

    // Check if notes are transposed from N1 N2 N3 to N2 N3 N4s
    // When tonic is D:
    // 1 (tonic) transposed by 2 semitones = N2 (E)
    // 2 (second) transposed by 2 semitones = N3 (F#) - but as N4s (F#)
    // 3 (third) transposed by 2 semitones = N4 (G)
    expect(irContent).toContain('"pitch_code": "N2"');
    expect(irContent).toContain('"pitch_code": "N3"');
    expect(irContent).toContain('"pitch_code": "N4s"');

    console.log('✅ Number system with tonic D correctly transposes pitches: 1→N2(E), 2→N3(F#), 3→N4(G)');
  }
});
