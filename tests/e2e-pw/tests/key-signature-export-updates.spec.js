import { test, expect } from '@playwright/test';

test.describe('Key Signature Export Updates', () => {
  test('should immediately update LilyPond export when key signature changes', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type some content first so there's something to export
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    // Set initial key signature to G major
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="G major"]').click();
    await page.waitForTimeout(1000); // Wait for export updates

    // Switch to LilyPond tab to check initial key
    await page.locator('[data-testid="tab-lilypond"]').click();
    await page.waitForTimeout(500);

    const lilypondPane = page.locator('[data-testid="pane-lilypond"]');
    await expect(lilypondPane).toBeVisible();

    let lilypondContent = await lilypondPane.textContent();
    expect(lilypondContent).toContain('\\key g \\major');

    // Change key signature to D major (while still on LilyPond tab)
    // This tests that forceUpdateAllExports() updates the current tab too
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="D major"]').click();
    await page.waitForTimeout(1000); // Wait for export updates

    // LilyPond tab should already show the updated key signature
    lilypondContent = await lilypondPane.textContent();

    // Verify the key signature was updated to D major
    expect(lilypondContent).toContain('\\key d \\major');
    // Should NOT still show old G major
    expect(lilypondContent).not.toContain('\\key g \\major');
  });

  test('should immediately update MusicXML export when key signature changes', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type some content
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Set initial key signature to F major
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="F major"]').click();
    await page.waitForTimeout(1000);

    // Switch to MusicXML tab to check initial key
    await page.locator('[data-testid="tab-musicxml"]').click();
    await page.waitForTimeout(500);

    const musicxmlPane = page.locator('[data-testid="pane-musicxml"]');
    await expect(musicxmlPane).toBeVisible();

    let musicxmlContent = await musicxmlPane.textContent();
    // F major has 1 flat (B-flat)
    expect(musicxmlContent).toContain('<fifths>-1</fifths>');

    // Change key signature to A major (while still on MusicXML tab)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="A major"]').click();
    await page.waitForTimeout(1000);

    // MusicXML tab should already be updated
    musicxmlContent = await musicxmlPane.textContent();

    // Verify the key signature was updated to A major (3 sharps)
    expect(musicxmlContent).toContain('<fifths>3</fifths>');
    // Should NOT still show old F major (-1)
    expect(musicxmlContent).not.toContain('<fifths>-1</fifths>');
  });

  test('should update all exports simultaneously when key signature changes', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type some content
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    // Set initial key signature to C major (no sharps/flats)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="C major"]').click();
    await page.waitForTimeout(1000);

    // Change to E major (4 sharps)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="E major"]').click();
    await page.waitForTimeout(1000); // Wait for all export updates

    // Check LilyPond tab - should be updated even though we weren't on it
    await page.locator('[data-testid="tab-lilypond"]').click();
    await page.waitForTimeout(300);
    let lilypondContent = await page.locator('[data-testid="pane-lilypond"]').textContent();
    expect(lilypondContent).toContain('\\key e \\major');

    // Check MusicXML tab - should also be updated
    await page.locator('[data-testid="tab-musicxml"]').click();
    await page.waitForTimeout(300);
    let musicxmlContent = await page.locator('[data-testid="pane-musicxml"]').textContent();
    expect(musicxmlContent).toContain('<fifths>4</fifths>');

    // Both exports should reflect E major immediately
  });

  test('should update exports when changing via display click', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type some content
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(500);

    // Set initial key signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="B-flat major"]').click();
    await page.waitForTimeout(1000);

    // Click the display to open selector
    const display = page.locator('#key-signature-display');
    await display.click();
    await page.waitForTimeout(300);

    // Select new key
    await page.locator('[data-key="E-flat major"]').click();
    await page.waitForTimeout(1000);

    // Check LilyPond was updated
    await page.locator('[data-testid="tab-lilypond"]').click();
    await page.waitForTimeout(300);
    const lilypondContent = await page.locator('[data-testid="pane-lilypond"]').textContent();
    expect(lilypondContent).toContain('\\key ees \\major');
  });
});
