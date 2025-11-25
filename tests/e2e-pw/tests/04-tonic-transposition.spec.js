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
    // Input: 1 2 3 (interpreted as scale degrees in C major context)
    // Tonic D means we use D major scale: D E F# G A B C#
    //
    // Lookup table transposition:
    // - Degree 1 in D major = "D" → maps to N2 (D is the 2nd note in number system)
    // - Degree 2 in D major = "E" → maps to N3 (E is the 3rd note in number system)
    // - Degree 3 in D major = "F#" → maps to N4s (F# is the 4th note sharp)

    expect(notes.length).toBe(3, 'Should have 3 notes');

    // With lookup table transposition:
    // Input degrees 1,2,3 in tonic D become: N2(D), N3(E), N4s(F#)
    expect(irContent).toContain('"pitch_code": "N2"');
    expect(irContent).toContain('"pitch_code": "N3"');
    expect(irContent).toContain('"pitch_code": "N4s"');

    console.log('✅ Lookup table transposition: 1→N2(D), 2→N3(E), 3→N4s(F#) in tonic D');
  }
});
