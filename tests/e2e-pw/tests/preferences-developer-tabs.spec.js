/**
 * Preferences: Show Developer Tools Tab Visibility Test
 *
 * This test verifies that when "Show Developer Tools" preference is set to false,
 * only user-facing tabs are visible:
 * - Staff Notation (always visible)
 * - LilyPond PNG (user-facing)
 * - LilyPond Source (user-facing)
 *
 * Developer tabs should be hidden:
 * - MusicXML
 * - Display List
 * - Persistent Model
 * - IR
 * - HTML
 */

import { test, expect } from '@playwright/test';

test.describe('Preferences: Developer Tabs Visibility', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start with fresh preferences
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('should show only user-facing tabs when showDeveloperTabs is false', async ({ page }) => {
    // Set preferences to hide developer tabs
    await page.evaluate(() => {
      const prefs = {
        showDeveloperTabs: false,
        defaultNotationSystem: 'western',
        showDebugInfo: false
      };
      localStorage.setItem('musicEditorPreferences', JSON.stringify(prefs));
    });

    // Reload page to apply preferences
    await page.goto('/');

    // Wait for app to initialize
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // User-facing tabs should be VISIBLE
    const staffNotationTab = page.locator('#tab-staff-notation');
    const lilypondPngTab = page.locator('#tab-lilypond-png');
    const lilypondSrcTab = page.locator('#tab-lilypond-src');

    await expect(staffNotationTab).toBeVisible();
    await expect(lilypondPngTab).toBeVisible();
    await expect(lilypondSrcTab).toBeVisible();

    // Developer tabs should be HIDDEN
    const musicxmlTab = page.locator('#tab-musicxml');
    const displayListTab = page.locator('#tab-displaylist');
    const persistentTab = page.locator('#tab-persistent');
    const irTab = page.locator('#tab-ir');
    const htmlTab = page.locator('#tab-html');

    await expect(musicxmlTab).toBeHidden();
    await expect(displayListTab).toBeHidden();
    await expect(persistentTab).toBeHidden();
    await expect(irTab).toBeHidden();
    await expect(htmlTab).toBeHidden();
  });

  test('should show all tabs when showDeveloperTabs is true', async ({ page }) => {
    // Set preferences to show all tabs (default behavior)
    await page.evaluate(() => {
      const prefs = {
        showDeveloperTabs: true,
        defaultNotationSystem: 'western',
        showDebugInfo: false
      };
      localStorage.setItem('musicEditorPreferences', JSON.stringify(prefs));
    });

    // Reload page to apply preferences
    await page.goto('/');

    // Wait for app to initialize
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // All tabs should be VISIBLE
    const staffNotationTab = page.locator('#tab-staff-notation');
    const lilypondPngTab = page.locator('#tab-lilypond-png');
    const lilypondSrcTab = page.locator('#tab-lilypond-src');
    const musicxmlTab = page.locator('#tab-musicxml');
    const displayListTab = page.locator('#tab-displaylist');
    const persistentTab = page.locator('#tab-persistent');
    const irTab = page.locator('#tab-ir');
    const htmlTab = page.locator('#tab-html');

    await expect(staffNotationTab).toBeVisible();
    await expect(lilypondPngTab).toBeVisible();
    await expect(lilypondSrcTab).toBeVisible();
    await expect(musicxmlTab).toBeVisible();
    await expect(displayListTab).toBeVisible();
    await expect(persistentTab).toBeVisible();
    await expect(irTab).toBeVisible();
    await expect(htmlTab).toBeVisible();
  });

  test('should toggle tab visibility when preference is changed via UI', async ({ page }) => {
    await page.goto('/');

    // Wait for app to initialize
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Initially all tabs should be visible (default: showDeveloperTabs = true)
    await expect(page.locator('#tab-musicxml')).toBeVisible();
    await expect(page.locator('#tab-displaylist')).toBeVisible();

    // Open preferences dialog (simulate keyboard shortcut or menu click)
    // For now, we'll use page.evaluate to open it directly
    await page.evaluate(() => {
      const app = window.MusicNotationApp.app();
      if (app && app.preferencesUI) {
        app.preferencesUI.open();
      }
    });

    // Wait for preferences modal to appear
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();

    // Uncheck "Show Developer Tabs"
    const showDevTabsCheckbox = page.locator('#showDeveloperTabs');
    await expect(showDevTabsCheckbox).toBeChecked();
    await showDevTabsCheckbox.uncheck();

    // Click Save
    await page.locator('button:has-text("Save")').click();

    // Wait for modal to close
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeHidden();

    // Developer tabs should now be HIDDEN
    await expect(page.locator('#tab-musicxml')).toBeHidden();
    await expect(page.locator('#tab-displaylist')).toBeHidden();
    await expect(page.locator('#tab-persistent')).toBeHidden();
    await expect(page.locator('#tab-ir')).toBeHidden();
    await expect(page.locator('#tab-html')).toBeHidden();

    // User-facing tabs should still be VISIBLE
    await expect(page.locator('#tab-staff-notation')).toBeVisible();
    await expect(page.locator('#tab-lilypond-png')).toBeVisible();
    await expect(page.locator('#tab-lilypond-src')).toBeVisible();
  });
});
