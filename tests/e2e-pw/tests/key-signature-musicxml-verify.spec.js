import { test, expect } from '@playwright/test';

test.describe('Key Signature MusicXML Verification', () => {
  test('should include key signature in MusicXML export', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type content
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3 4 5 6 7');
    await page.waitForTimeout(500);

    // Set F# major (6 sharps)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="F-sharp major"]').click();
    await page.waitForTimeout(1000);

    // Switch to MusicXML tab
    await page.locator('[data-testid="tab-musicxml"]').click();
    await page.waitForTimeout(500);

    const musicxmlPane = page.locator('[data-testid="pane-musicxml"]');
    await expect(musicxmlPane).toBeVisible();

    const musicxmlContent = await musicxmlPane.textContent();

    // Log the MusicXML content for inspection
    console.log('=== MusicXML Content (first 2000 chars) ===');
    console.log(musicxmlContent.substring(0, 2000));
    console.log('===========================================');

    // F# major has 6 sharps, represented as <fifths>6</fifths>
    expect(musicxmlContent).toContain('<fifths>6</fifths>');
    console.log('✅ MusicXML contains <fifths>6</fifths> for F# major');

    // Switch to LilyPond tab to verify it's there too
    await page.locator('[data-testid="tab-lilypond"]').click();
    await page.waitForTimeout(500);

    const lilypondPane = page.locator('[data-testid="pane-lilypond"]');
    const lilypondContent = await lilypondPane.textContent();

    console.log('=== LilyPond Content (key signature line) ===');
    const keyLine = lilypondContent.split('\n').find(line => line.includes('\\key'));
    console.log(keyLine);
    console.log('===========================================');

    // F# major in LilyPond (note: LilyPond uses "fs" not "fis" in english mode)
    expect(lilypondContent).toContain('\\key fs \\major');
    console.log('✅ LilyPond contains \\key fs \\major');
  });

  test('should show E major (4 sharps) in MusicXML', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    // Set E major (4 sharps: F#, C#, G#, D#)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="E major"]').click();
    await page.waitForTimeout(1000);

    // Check MusicXML
    await page.locator('[data-testid="tab-musicxml"]').click();
    await page.waitForTimeout(500);

    const musicxmlContent = await page.locator('[data-testid="pane-musicxml"]').textContent();

    console.log('=== E major MusicXML <key> element ===');
    const keyMatch = musicxmlContent.match(/<key>.*?<\/key>/s);
    if (keyMatch) {
      console.log(keyMatch[0]);
    }
    console.log('=======================================');

    expect(musicxmlContent).toContain('<fifths>4</fifths>');
    console.log('✅ E major correctly exported as <fifths>4</fifths>');
  });

  test('should show B-flat major (2 flats) in MusicXML', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Set B-flat major (2 flats: B♭, E♭)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="B-flat major"]').click();
    await page.waitForTimeout(1000);

    // Check MusicXML
    await page.locator('[data-testid="tab-musicxml"]').click();
    await page.waitForTimeout(500);

    const musicxmlContent = await page.locator('[data-testid="pane-musicxml"]').textContent();

    console.log('=== B-flat major MusicXML <key> element ===');
    const keyMatch = musicxmlContent.match(/<key>.*?<\/key>/s);
    if (keyMatch) {
      console.log(keyMatch[0]);
    }
    console.log('============================================');

    // B-flat major has 2 flats = -2 fifths
    expect(musicxmlContent).toContain('<fifths>-2</fifths>');
    console.log('✅ B-flat major correctly exported as <fifths>-2</fifths>');
  });
});
