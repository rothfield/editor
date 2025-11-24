import { test, expect } from '@playwright/test';

test.describe('Western Pitch System - Multiple B-flat Input', () => {
  test('typing "bbbb" should produce two B-flat notes, not ignore last b', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();

    // Open new document dialog via File menu
    await page.click('#file-menu-button');
    await page.click('#menu-new');

    // Wait for dialog
    await page.waitForSelector('.new-document-overlay', { state: 'visible' });

    // Select Western pitch system using radio button
    await page.click('input[type="radio"][value="western"]');

    // Press Enter to create document
    await page.keyboard.press('Enter');

    // Wait for dialog to close
    await page.waitForTimeout(300);

    // Click editor to focus
    await editor.click();
    await page.waitForTimeout(200);

    // Type "bbbb" (should be B♭ B♭ or B♭♭ B)
    await page.keyboard.type('bbbb');

    // Wait for rendering
    await page.waitForTimeout(200);

    // Check editor content
    const editorContent = await editor.textContent();
    console.log('Editor content after "bbbb":', editorContent);

    // Open LilyPond tab to check export
    await page.click('[data-testid="tab-lilypond"]');
    const lilypondPane = page.locator('[data-testid="pane-lilypond"]');
    await expect(lilypondPane).toBeVisible();

    // Wait for export to populate
    await expect.poll(async () => {
      const text = await lilypondPane.innerText();
      return text.trim().length;
    }).toBeGreaterThan(0);

    const lilypondOutput = await lilypondPane.innerText();
    console.log('LilyPond output:', lilypondOutput);

    // Expected: Two B-flat notes (bes bes in LilyPond)
    // OR: B-double-flat and B-natural (beses b)
    // The bug: last 'b' is ignored, so we might only see "bes" (one note)

    // Count how many note pitches are in the output
    // LilyPond with \language "english" uses:
    // b = B natural, bf = B-flat, bff = B-double-flat
    // (Dutch notation uses: b, bes, beses)
    const noteMatches = lilypondOutput.match(/\b(b|bf|bff|bes|beses)['',]*\d*\b/g);
    const noteCount = noteMatches ? noteMatches.length : 0;

    console.log('Notes found in LilyPond:', noteMatches);
    console.log('Note count:', noteCount);

    // Should have 2 notes
    expect(noteCount).toBe(2);

    // Verify it's one of the valid interpretations:
    // Option 1 (English): B♭♭ B → "bff" and "b"
    // Option 2 (English): B♭ B♭ → "bf" appears twice
    // Option 3 (Dutch): B♭♭ B → "beses" and "b"
    // Option 4 (Dutch): B♭ B♭ → "bes" appears twice
    const hasEnglishBdoubleFlatAndB = lilypondOutput.includes('bff') && lilypondOutput.includes('b');
    const hasEnglishTwoBflats = (lilypondOutput.match(/\bbf['',]*\d*\b/g) || []).length >= 2;
    const hasDutchBdoubleFlatAndB = lilypondOutput.includes('beses') && lilypondOutput.includes('b');
    const hasDutchTwoBflats = (lilypondOutput.match(/\bbes['',]*\d*\b/g) || []).length >= 2;

    const isValidInterpretation = hasEnglishBdoubleFlatAndB || hasEnglishTwoBflats ||
                                  hasDutchBdoubleFlatAndB || hasDutchTwoBflats;

    expect(isValidInterpretation).toBe(true);
  });

  test('typing "bbbb" should create 2 cells (B double-flat + B natural)', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();

    // Open new document dialog and select Western
    await page.click('#file-menu-button');
    await page.click('#menu-new');
    await page.waitForSelector('.new-document-overlay', { state: 'visible' });
    await page.click('input[type="radio"][value="western"]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    await editor.click();
    await page.waitForTimeout(200);

    // Type "bbbb"
    await page.keyboard.type('bbbb');
    await page.waitForTimeout(200);

    // Check Document Model to see how many cells were created
    await page.click('[data-testid="tab-docmodel"]');
    const docModelPane = page.locator('[data-testid="pane-docmodel"]');
    await expect(docModelPane).toBeVisible();

    const docModelText = await docModelPane.innerText();
    console.log('Document Model:', docModelText);

    // Count pitch_code entries (each cell has one)
    const pitchCodeMatches = docModelText.match(/pitch_code:/g);
    const cellCount = pitchCodeMatches ? pitchCodeMatches.length : 0;
    console.log('Cell count (via pitch_code):', cellCount);

    // Should have 2 cells: B double-flat (N7bb) + B natural (N7)
    expect(cellCount).toBe(2);

    // Verify the pitch codes are correct
    expect(docModelText).toContain('N7bb'); // B double-flat
    expect(docModelText).toContain('N7');   // B natural (but not N7bb)
  });

  test('MusicXML should contain 2 notes for "bbbb" input', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();

    // Open new document dialog and select Western
    await page.click('#file-menu-button');
    await page.click('#menu-new');
    await page.waitForSelector('.new-document-overlay', { state: 'visible' });
    await page.click('input[type="radio"][value="western"]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    await editor.click();
    await page.waitForTimeout(200);

    // Type "bbbb"
    await page.keyboard.type('bbbb');
    await page.waitForTimeout(200);

    // Open MusicXML tab
    await page.click('[data-testid="tab-musicxml"]');
    const musicxmlPane = page.locator('[data-testid="pane-musicxml"]');
    await expect(musicxmlPane).toBeVisible();

    // Wait for export
    await expect.poll(async () => {
      const text = await musicxmlPane.innerText();
      return text.trim().length;
    }).toBeGreaterThan(0);

    const musicxmlOutput = await musicxmlPane.innerText();
    console.log('MusicXML output snippet:', musicxmlOutput.substring(0, 500));

    // Count <note> elements
    const noteMatches = musicxmlOutput.match(/<note>/g);
    const noteCount = noteMatches ? noteMatches.length : 0;

    console.log('MusicXML note count:', noteCount);

    // Should have 2 notes
    expect(noteCount).toBe(2);

    // Should have <step>B</step> for both notes
    const stepBMatches = musicxmlOutput.match(/<step>B<\/step>/g);
    const stepBCount = stepBMatches ? stepBMatches.length : 0;

    console.log('MusicXML B-step count:', stepBCount);
    expect(stepBCount).toBe(2);

    // Should have <alter>-1</alter> (flat) or <alter>-2</alter> (double-flat)
    const alterMatches = musicxmlOutput.match(/<alter>-[12]<\/alter>/g);
    const alterCount = alterMatches ? alterMatches.length : 0;

    console.log('MusicXML alter count:', alterCount);
    expect(alterCount).toBeGreaterThanOrEqual(1); // At least one alteration
  });

  test('cursor position should be 2 after typing "bbbb"', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.locator('[data-testid="editor-root"]');
    await expect(editor).toBeVisible();

    // Open new document dialog and select Western
    await page.click('#file-menu-button');
    await page.click('#menu-new');
    await page.waitForSelector('.new-document-overlay', { state: 'visible' });
    await page.click('input[type="radio"][value="western"]');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    await editor.click();
    await page.waitForTimeout(200);

    // Type "bbbb"
    await page.keyboard.type('bbbb');
    await page.waitForTimeout(200);

    // Check Document Model for cursor position
    await page.click('[data-testid="tab-docmodel"]');
    const docModelPane = page.locator('[data-testid="pane-docmodel"]');
    await expect(docModelPane).toBeVisible();

    const docModelText = await docModelPane.innerText();

    // Find cursor position in the document model
    const cursorMatch = docModelText.match(/cursor:\s*\n\s*line:\s*(\d+)\s*\n\s*col:\s*(\d+)/);

    if (cursorMatch) {
      const line = parseInt(cursorMatch[1]);
      const col = parseInt(cursorMatch[2]);

      console.log('Cursor position:', { line, col });

      // Cursor should be at col 2 (after 2 cells: B double-flat + B natural)
      expect(line).toBe(0);
      expect(col).toBe(2);
    } else {
      throw new Error('Could not find cursor position in document model');
    }
  });
});
