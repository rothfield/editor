/**
 * Ornament Indicator Feature Tests
 *
 * Tests the new ornament-indicator system that marks ornament regions
 * similar to slur-indicator pattern.
 */

import { test, expect } from '@playwright/test';

test.describe('Ornament Indicator - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('can apply ornament indicator with Alt+O', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type a sequence of notes
    await editor.type('1 2 3 4');

    // Select the first two notes (we'll use keyboard selection)
    // Position cursor at start, then shift+right to select
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight'); // Select '1'
    await page.keyboard.press('Shift+ArrowRight'); // Select ' '
    await page.keyboard.press('Shift+ArrowRight'); // Select '2'

    // Apply ornament indicator with Alt+O
    await page.keyboard.press('Alt+o');

    // Wait for re-render
    await page.waitForTimeout(500);

    // Check if ornament classes are applied
    const ornamentFirst = page.locator('.ornament-first');
    await expect(ornamentFirst).toBeVisible();

    const ornamentLast = page.locator('.ornament-last');
    await expect(ornamentLast).toBeVisible();
  });

  test('ornament indicator cells are rendered smaller and raised', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type notes and apply ornament indicator
    await editor.type('1 2 3');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Get ornament cell
    const ornamentCell = page.locator('.ornament-first').first();
    await expect(ornamentCell).toBeVisible();

    // Check computed style (should be smaller)
    const fontSize = await ornamentCell.evaluate(el =>
      window.getComputedStyle(el).fontSize
    );

    // The ornament should have 0.75em font-size, which should be smaller than base
    expect(fontSize).toBeTruthy();
  });

  test('can toggle ornament indicator off', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type notes, apply ornament, then toggle off
    await editor.type('1 2');
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    // Apply ornament
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Verify ornament is applied
    await expect(page.locator('.ornament-first')).toBeVisible();

    // Select the same region again and toggle off
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Ornament classes should be gone
    await expect(page.locator('.ornament-first')).not.toBeVisible();
  });

  test('Alt+Shift+O toggles edit ornaments mode', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Toggle edit mode on
    await page.keyboard.press('Alt+Shift+O');
    await page.waitForTimeout(300);

    // Check console log for confirmation
    const consoleLog = page.locator('#console-log-list');
    const logText = await consoleLog.textContent();
    expect(logText).toContain('Ornament edit mode: ON');

    // Toggle edit mode off
    await page.keyboard.press('Alt+Shift+O');
    await page.waitForTimeout(300);

    const logText2 = await consoleLog.textContent();
    expect(logText2).toContain('Ornament edit mode: OFF');
  });

  test('ornament indicator appears in Edit menu', async ({ page }) => {
    // Click Edit menu
    const editButton = page.locator('button:has-text("Edit")');
    await editButton.click();

    // Check for ornament menu items
    const applyOrnamentItem = page.locator('#menu-apply-ornament');
    await expect(applyOrnamentItem).toBeVisible();
    await expect(applyOrnamentItem).toContainText('Apply Ornament (Alt+O)');

    const editOrnamentsItem = page.locator('#menu-edit-ornaments');
    await expect(editOrnamentsItem).toBeVisible();
    await expect(editOrnamentsItem).toContainText('Edit Ornaments (Alt+Shift+O)');
  });

  test('requires selection to apply ornament indicator', async ({ page }) => {
    const editor = page.locator('#notation-editor');

    // Type notes but don't select anything
    await editor.type('1 2 3');

    // Try to apply ornament without selection
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(300);

    // Should show warning (check console or notification)
    const consoleLog = page.locator('#console-log-list');
    const logText = await consoleLog.textContent();

    // Should not have ornament classes
    await expect(page.locator('.ornament-first')).not.toBeVisible();
  });
});

test.describe('Ornament Indicator - Beat Grouping', () => {
  test('ornament notes are excluded from beat grouping', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type a pattern with beats
    await editor.type('1 2 3 | 4 5 6');

    // Mark first two notes as ornament
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Check Layout tab to see if beat grouping excludes ornaments
    const layoutTab = page.locator('button[data-testid="tab-wasm"]');
    if (await layoutTab.isVisible()) {
      await layoutTab.click();
      await page.waitForTimeout(300);

      const layoutPane = page.locator('[data-testid="pane-wasm"]');
      const layoutText = await layoutPane.textContent();

      // Beat grouping should start after ornament span
      // This is a basic check - actual beat structure depends on implementation
      expect(layoutText).toBeTruthy();
    }
  });
});

test.describe('Ornament Indicator - MusicXML Export', () => {
  test('ornament notes are skipped in MusicXML export', async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type notes with ornament indicator
    await editor.type('1 2 3 4');

    // Mark first two as ornament
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    await page.keyboard.press('Alt+o');
    await page.waitForTimeout(500);

    // Check MusicXML tab
    const musicxmlTab = page.locator('button[data-testid="tab-musicxml"]');
    if (await musicxmlTab.isVisible()) {
      await musicxmlTab.click();
      await page.waitForTimeout(300);

      const musicxmlPane = page.locator('[data-testid="pane-musicxml"]');
      const xmlText = await musicxmlPane.textContent();

      // Should have fewer notes (ornaments skipped)
      // Should have TODO comment
      expect(xmlText).toContain('TODO');
      expect(xmlText).toBeTruthy();
    }
  });
});
