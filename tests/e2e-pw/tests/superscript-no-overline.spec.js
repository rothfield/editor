import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

/**
 * Bug: Single superscript pitch incorrectly shows overline
 *
 * Type "4", make it superscript -> should be Number system superscript "4" with no lines
 * Expected codepoint: 0xF8BA0 (Number superscript base + offset for "4" + line_variant 0)
 */

test('superscript 4 should have correct codepoint with no overline', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear and type "4"
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  await page.keyboard.type('4');
  await page.waitForTimeout(100);

  // Select and make superscript
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(300);

  // Check codepoint in DocModel
  await openTab(page, 'tab-docmodel');
  const docModel = await readPaneText(page, 'pane-docmodel');

  console.log('=== DocModel ===');
  console.log(docModel);

  // Extract codepoint from docmodel
  const cpMatch = docModel.match(/codepoint:\s*(\d+)/);
  const codepoint = cpMatch ? parseInt(cpMatch[1]) : 0;

  console.log('Codepoint:', codepoint, '(0x' + codepoint.toString(16).toUpperCase() + ')');

  // Expected: Number superscript "4" with line_variant=0 (no lines)
  // 0xF8600 (base) + (90 * 16) (N4 offset) + 0 (no lines) = 0xF8BA0 = 1018784
  const expected = 0xF8BA0; // 1018784

  console.log('Expected:', expected, '(0x' + expected.toString(16).toUpperCase() + ')');

  expect(codepoint).toBe(expected);
});
