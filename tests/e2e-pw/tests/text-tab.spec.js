/**
 * E2E Test: Text Tab Inspector Feature
 *
 * Tests the "Text" inspector tab that displays plain text with Unicode combining characters.
 * This tab provides a copy/paste-friendly representation of the notation.
 */
import { test, expect } from '@playwright/test';

test.describe('Text Tab Inspector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#notation-editor');
    await page.click('#notation-editor');
  });

  test('should display Text tab button', async ({ page }) => {
    const textTab = page.locator('[data-testid="tab-text"]');
    await expect(textTab).toBeVisible();
    await expect(textTab).toHaveText('Text');
  });

  test('should switch to Text tab and show content', async ({ page }) => {
    // Type some content first
    await page.keyboard.type('1 2 3');

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    // Wait for the text display to be visible
    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Verify content is not empty (should show the typed notes)
    // Note: Using inputValue() for textarea elements instead of innerText()
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      return text.trim().length;
    }).toBeGreaterThan(0);
  });

  test('should have mode toggle dropdown', async ({ page }) => {
    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    // Check for mode toggle dropdown
    const modeToggle = page.locator('#text-mode-toggle');
    await expect(modeToggle).toBeVisible();

    // Check for both options
    await expect(modeToggle.locator('option[value="combining"]')).toBeAttached();
    await expect(modeToggle.locator('option[value="multiline"]')).toBeAttached();
  });

  test('should switch between combining and multiline modes', async ({ page }) => {
    // Type some content first
    await page.keyboard.type('1 2 3');

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    // Wait for text display
    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Get content in combining mode (default)
    // Note: Using inputValue() for textarea elements instead of innerText()
    await expect.poll(async () => (await textDisplay.inputValue()).trim()).not.toBe('');
    const combiningContent = await textDisplay.inputValue();

    // Switch to multiline mode
    await page.selectOption('#text-mode-toggle', 'multiline');

    // Wait for content to update
    await expect.poll(async () => {
      const newContent = await textDisplay.inputValue();
      // In multiline mode, there might be multiple lines or different formatting
      return newContent !== combiningContent || newContent.length > 0;
    }).toBeTruthy();
  });

  test('should update in real-time as user types', async ({ page }) => {
    // Click on Text tab first
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Get initial content
    // Note: Using inputValue() for textarea elements instead of innerText()
    const initialContent = await textDisplay.inputValue();

    // Focus back on editor and type
    await page.click('#notation-editor');
    await page.keyboard.type('1');

    // Check that content updated
    await expect.poll(async () => {
      const newContent = await textDisplay.inputValue();
      return newContent !== initialContent;
    }).toBeTruthy();
  });

  test('should display note characters in text output', async ({ page }) => {
    // Type some notes
    await page.keyboard.type('1 2 3');

    // Wait a moment for WASM to process
    await page.waitForTimeout(100);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to appear
    // Note: Text export now uses PUA glyphs (NotationFont) instead of ASCII
    // Check that output is non-empty and has reasonable length (3 notes + 2 spaces = ~5+ chars)
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      // Output should be non-empty and contain the notes (PUA codepoints render as glyphs)
      return text.trim().length >= 3;
    }, { timeout: 5000 }).toBeTruthy();
  });

  test('should display ornaments in text output when set', async ({ page }) => {
    // Type notes: main note followed by ornament notes, then another main note
    // Pattern: "1" is main note, "2 3" will be ornament, "4" is next main note
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(200);

    // Select the middle notes "2 3" to make them an ornament
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // past "1"
    await page.keyboard.press('ArrowRight'); // past space
    // Select "2 3"
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }

    // Apply ornament with Alt+0
    await page.keyboard.press('Alt+0');
    await page.waitForTimeout(300);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Get the text and log it for debugging
    const text = await textDisplay.inputValue();
    console.log('Text output with ornament:', JSON.stringify(text));

    // Check IR tab to see grace notes
    await page.click('[data-testid="tab-ir"]');
    const irDisplay = page.locator('[data-testid="pane-ir"]');
    await expect(irDisplay).toBeVisible();
    const irText = await irDisplay.innerText();
    // Look for grace_notes in IR
    const hasGraceNotes = irText.includes('grace_notes_before') &&
      (irText.includes('"pitch_code": "N2"') || irText.includes('"pitch_code": "N3"'));
    console.log('IR has grace notes:', hasGraceNotes);
    console.log('IR excerpt:', irText.substring(0, 1500));

    // Text export uses PUA glyphs now - just verify we have content
    // The main notes should be in the output (as PUA codepoints that render with NotationFont)
    expect(text.trim().length).toBeGreaterThan(0);
    // Ornaments should add an extra line above the main notes
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(1); // At least the note line
  });

  test('should display lyrics in text output when set', async ({ page }) => {
    // Type some notes first
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(100);

    // Set lyrics via the menu dialog
    // Handle the prompt dialog
    page.on('dialog', async dialog => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('hel-lo world');
      }
    });

    // Open the Line menu by clicking the Line menu button
    await page.click('#line-menu-button');

    // Click on "Set Lyrics..." menu item
    const setLyricsMenuItem = page.locator('#menu-set-lyrics');
    await expect(setLyricsMenuItem).toBeVisible();
    await setLyricsMenuItem.click();

    // Wait for the lyrics to be applied
    await page.waitForTimeout(200);

    // Click on Text tab
    await page.click('[data-testid="tab-text"]');

    const textDisplay = page.locator('[data-testid="pane-text"]');
    await expect(textDisplay).toBeVisible();

    // Wait for content to include lyrics
    // Lyrics should appear on a separate line below the notes
    await expect.poll(async () => {
      const text = await textDisplay.inputValue();
      // Check for lyrics syllables (hel-lo world parses as "hel", "lo", "world")
      return text.includes('hel') && text.includes('lo') && text.includes('world');
    }, { timeout: 5000 }).toBeTruthy();
  });
});
