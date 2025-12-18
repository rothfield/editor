/**
 * E2E Test: Barline combining - tests actual textarea value
 *
 * This test checks the REAL browser behavior by examining the textarea
 * value after typing, not just the WASM document state.
 */

import { test, expect } from '@playwright/test';

test.describe('Barline combining (real textarea)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Clear any existing content
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);
  });

  test('typing |: should result in 1 character in textarea', async ({ page }) => {
    // Capture console messages
    const logs = [];
    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type | then :
    await page.keyboard.type('|');
    await page.waitForTimeout(100);
    await page.keyboard.type(':');
    await page.waitForTimeout(300); // Wait for any debounced updates

    // Check the ACTUAL textarea value - this is what the user sees
    const textareaValue = await page.evaluate(() => {
      const textarea = document.querySelector('#notation-editor textarea');
      return textarea ? textarea.value : null;
    });

    console.log('Textarea value:', textareaValue);
    console.log('Textarea length:', textareaValue?.length);
    console.log('Codepoints:', textareaValue ? [...textareaValue].map(c => c.codePointAt(0).toString(16)) : []);
    console.log('Console logs:', logs.filter(l => l.includes('error') || l.includes('Error') || l.includes('InputHandler')));

    // Should be ONE character (the combined barline), not two
    expect([...textareaValue].length).toBe(1);
  });

  test('typing :| should result in 1 character in textarea', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type : then |
    await page.keyboard.type(':');
    await page.waitForTimeout(100);
    await page.keyboard.type('|');
    await page.waitForTimeout(300);

    const textareaValue = await page.evaluate(() => {
      const textarea = document.querySelector('#notation-editor textarea');
      return textarea ? textarea.value : null;
    });

    console.log('Textarea value:', textareaValue);
    console.log('Textarea length:', textareaValue?.length);
    console.log('Codepoints:', textareaValue ? [...textareaValue].map(c => c.codePointAt(0).toString(16)) : []);

    // Should be ONE character (the combined barline), not two
    expect([...textareaValue].length).toBe(1);
  });

  test('typing single | should result in barline glyph', async ({ page }) => {
    const editor = page.locator('#notation-editor');
    await editor.click();

    // Type just |
    await page.keyboard.type('|');
    await page.waitForTimeout(300);

    const textareaValue = await page.evaluate(() => {
      const textarea = document.querySelector('#notation-editor textarea');
      return textarea ? textarea.value : null;
    });

    console.log('Single | - Textarea value:', textareaValue);
    console.log('Single | - Codepoints:', textareaValue ? [...textareaValue].map(c => c.codePointAt(0).toString(16)) : []);

    // Should be U+1D100 (BARLINE_SINGLE)
    const codepoints = [...textareaValue].map(c => c.codePointAt(0));
    expect(codepoints[0]).toBe(0x1D100);
  });
});

test('typing 1 should result in N1 pitch', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  await page.keyboard.type('1');
  await page.waitForTimeout(300);

  const textareaValue = await page.evaluate(() => {
    const textarea = document.querySelector('#notation-editor textarea');
    return textarea ? textarea.value : null;
  });

  console.log('Typing 1 - Textarea value:', textareaValue);
  console.log('Typing 1 - Codepoints:', textareaValue ? [...textareaValue].map(c => c.codePointAt(0).toString(16)) : []);

  // N1 in Number system should be 0xE000
  const codepoints = [...textareaValue].map(c => c.codePointAt(0));
  expect(codepoints[0]).toBe(0xE000);
});
