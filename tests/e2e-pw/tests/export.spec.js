import { test, expect } from '../fixtures/editor.fixture';

test.describe('Export Functionality', () => {
  test('should have export options in File menu', async ({ cleanPage: page }) => {
    await page.goto('/');

    // Look for File menu
    const fileMenu = page.locator('button:has-text("File"), [role="button"]:has-text("File")').first();
    await expect(fileMenu).toBeVisible();
    await fileMenu.click();

    // Look for Export menu item
    const exportMenuItem = page.locator('text=Export...').first();
    await expect(exportMenuItem).toBeVisible();
    await exportMenuItem.click();

    // Verify export options are available
    await expect(page.locator('text=MusicXML')).toBeVisible();
    await expect(page.locator('text=MIDI')).toBeVisible();
    await expect(page.locator('text=Lilypond Source')).toBeVisible();
  });
});
