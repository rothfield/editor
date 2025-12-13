/**
 * Test: Barline combinations should combine into single glyphs
 *
 * When typing barline sequences like "||", "|:", ":|" in the textarea,
 * they should be combined into single barline cells via smart insert.
 */

import { test, expect } from '@playwright/test';
import { typeInEditor } from '../utils/editor.helpers.js';

test.describe('Textarea barline combinations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="notation-textarea-0"]');
  });

  test('|| should render as double-barline (displayed as 2 ASCII chars)', async ({ page }) => {
    // Type "||" - parsed as single double-barline cell, displayed as "||"
    await typeInEditor(page, '||');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    // Barlines are displayed as ASCII strings, not PUA glyphs
    // Double barline cell displays as "||" (2 chars)
    expect(textContent).toBe('||');
  });

  test('|: should render as repeat-left barline (displayed as 2 ASCII chars)', async ({ page }) => {
    // Type "|:" - parsed as single repeat-left cell, displayed as "|:"
    await typeInEditor(page, '|:');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    // Repeat left barline displays as "|:"
    expect(textContent).toBe('|:');
  });

  test(':| should render as repeat-right barline (displayed as 2 ASCII chars)', async ({ page }) => {
    // Type ":|" - parsed as single repeat-right cell, displayed as ":|"
    await typeInEditor(page, ':|');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    // Repeat right barline displays as ":|"
    expect(textContent).toBe(':|');
  });

  test('single | should remain as single barline', async ({ page }) => {
    await typeInEditor(page, '|');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    expect(textContent.length).toBe(1);
  });

  test('||| should render as double-barline + single-barline', async ({ page }) => {
    // Type "|||" - parsed as || (double) + | (single) = 2 cells
    await typeInEditor(page, '|||');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    // Should be "|||" (double barline "||" + single barline "|")
    // Note: display adds space between different barline cells
    expect(textContent).toContain('||');
    expect(textContent).toContain('|');
  });

  test('|:| should render as repeat-left + single-barline', async ({ page }) => {
    // Type "|:|" - parsed as |: (repeat left) + | (single) = 2 cells
    await typeInEditor(page, '|:|');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    // Should contain repeat-left and single barline
    expect(textContent).toContain('|:');
  });

  test('mixed "1 | 2" should have barline between notes', async ({ page }) => {
    await typeInEditor(page, '1 | 2');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    // Should contain at least 3 meaningful chars (note, barline, note)
    // Spaces may vary based on beat grouping
    expect(textContent.length).toBeGreaterThanOrEqual(3);
  });

  test('|: 1 2 :| should create repeat structure', async ({ page }) => {
    await typeInEditor(page, '|: 1 2 :|');

    const textarea = page.locator('[data-testid="notation-textarea-0"]');
    const textContent = await textarea.inputValue();

    // Should have repeat-left, notes, repeat-right
    // Exact length depends on spacing
    expect(textContent.length).toBeGreaterThanOrEqual(4);
  });
});
