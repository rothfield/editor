/**
 * Font Test - No Brackets Test
 * Verifies that the Brackets (Staff Grouping) section is not displayed in Font Test tab
 */

import { test, expect } from '@playwright/test';

test.describe('Font Test - No Brackets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#editor-container');
    await expect(editor).toBeVisible();
  });

  test('Comprehensive View does not show Brackets section', async ({ page }) => {
    // Navigate to Font Test tab
    const fontTestTab = page.locator('#tab-font-test');
    await fontTestTab.click();

    // Click "Comprehensive View"
    const showAllBtn = page.locator('#font-test-show-all');
    await showAllBtn.click();

    // Wait for content to render
    await page.waitForTimeout(500);

    const grid = page.locator('#font-test-grid');
    await expect(grid).toBeVisible();

    // Get all section headings
    const headings = await grid.locator('h3').allTextContents();

    // Verify "Brackets (Staff Grouping)" is NOT in the list
    expect(headings).not.toContain('Brackets (Staff Grouping)');

    // Verify other sections are still present
    expect(headings.some(h => h.includes('Accidentals'))).toBe(true);
    expect(headings.some(h => h.includes('Barlines'))).toBe(true);
    expect(headings.some(h => h.includes('Ornaments'))).toBe(true);
  });

  test('Unicode Table does not show Bracket symbols', async ({ page }) => {
    // Navigate to Font Test tab
    const fontTestTab = page.locator('#tab-font-test');
    await fontTestTab.click();

    // Click "Unicode Table"
    const tableBtn = page.locator('#font-test-show-table');
    await tableBtn.click();

    // Wait for table to render
    await page.waitForTimeout(500);

    const grid = page.locator('#font-test-grid');
    await expect(grid).toBeVisible();

    // Get all type badges in the table
    const typeBadges = await grid.locator('span.bg-blue-100').allTextContents();

    // Verify "Bracket" is NOT in the list
    expect(typeBadges).not.toContain('Bracket');

    // Verify other types are still present (using some() to check if any badge contains the text)
    const hasAccidental = typeBadges.some(badge => badge.includes('Accidental'));
    const hasSymbol = typeBadges.some(badge => badge.includes('Symbol'));

    expect(hasAccidental).toBe(true);
    expect(hasSymbol).toBe(true); // Barlines and Ornaments are categorized as "Symbol"
  });
});
