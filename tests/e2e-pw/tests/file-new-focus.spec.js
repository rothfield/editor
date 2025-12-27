// @ts-check
import { test, expect } from '@playwright/test';

/**
 * RGR Test: After File > New, textarea should be automatically focused
 * and typing "1" should append a character.
 *
 * BUG: newFile() in file-ops.ts has a 200ms setTimeout that calls
 * requestFocus() which focuses the notation-editor DIV (not textarea),
 * overwriting the correct textarea focus set by returnFocusToEditor().
 *
 * This test waits 250ms after dialog closes to expose the race condition.
 */
test('after File > New, textarea is focused and typing 1 appends char', async ({ page }) => {
  await page.goto('/');

  // Wait for WASM to initialize
  await expect(page.locator('.notation-editor')).toBeVisible();
  await page.waitForFunction(() => window.editor?.wasmModule?.getDocumentSnapshot);

  // File > New via menu
  await page.click('#file-menu-button');
  await page.click('#menu-new');

  // Handle new document dialog - it always appears
  const dialog = page.locator('.new-document-dialog');
  await expect(dialog).toBeVisible({ timeout: 2000 });
  await page.click('.new-document-dialog button:has-text("Create")');
  // Wait for dialog to fully close
  await expect(dialog).not.toBeVisible({ timeout: 2000 });

  // Wait for the 200ms setTimeout in newFile() to fire and clobber focus
  // This exposes the race condition bug
  await page.waitForTimeout(250);

  // CRITICAL: Verify textarea is STILL focused after the 200ms timeout
  const focusState = await page.evaluate(() => {
    const activeEl = document.activeElement;
    return {
      tag: activeEl?.tagName,
      id: activeEl?.id,
      className: activeEl?.className,
      isTextarea: activeEl?.tagName === 'TEXTAREA' &&
                  activeEl?.classList.contains('notation-textarea')
    };
  });

  console.log('Focus state after 250ms:', focusState);

  expect(focusState.isTextarea).toBe(true);

  // Type "1" using keyboard (NOT clicking first)
  await page.keyboard.type('1');

  // Verify the character was appended to document model
  const modelState = await page.evaluate(() => {
    const snapshot = window.editor.wasmModule.getDocumentSnapshot();
    if (!snapshot?.lines?.[0]) {
      return { error: 'No document or lines', snapshot };
    }
    const cells = snapshot.lines[0].cells || [];
    return {
      cellCount: cells.length,
      firstPitchCode: cells[0]?.pitch_code
    };
  });

  expect(modelState.cellCount).toBe(1);
  expect(modelState.firstPitchCode).toBe('N1');
});
