// @ts-check
import { test, expect } from '@playwright/test';

test('typing after File > New produces pitched element in model', async ({ page }) => {
  // Collect console logs
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  // Go to app
  await page.goto('/');

  // Wait for WASM to initialize
  await expect(page.locator('.notation-editor')).toBeVisible();
  await page.waitForFunction(() => window.editor?.wasmModule?.getDocumentSnapshot);

  // Create new document via menu
  await page.click('#file-menu-button');
  await page.click('#menu-new');

  // Wait for new document dialog if it appears
  await page.waitForTimeout(300);

  // Check if dialog appeared and close it with default settings
  const dialog = page.locator('.new-document-dialog');
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    console.log('Dialog appeared, clicking Create');
    await page.click('.new-document-dialog button:has-text("Create")');
    await page.waitForTimeout(200);
  }

  // Wait for textarea to exist
  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible({ timeout: 5000 });

  // Debug: check what's focused before clicking
  const beforeClickState = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName,
    activeClass: document.activeElement?.className,
    textareaExists: !!document.querySelector('.notation-textarea'),
    isTextareaMode: window.editor?.renderer?.isTextareaMode?.()
  }));
  console.log('Before click:', beforeClickState);

  // Click the textarea
  await textarea.click();
  await page.waitForTimeout(100);

  // Debug: check what's focused after clicking
  const afterClickState = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName,
    activeClass: document.activeElement?.className
  }));
  console.log('After click:', afterClickState);

  // If click didn't focus, try explicit focus
  if (afterClickState.activeTag !== 'TEXTAREA') {
    console.log('Click did not focus textarea, trying explicit focus');
    await textarea.focus();
    await page.waitForTimeout(100);
  }

  // Debug: final focus state
  const finalState = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName,
    activeClass: document.activeElement?.className
  }));
  console.log('Final focus state:', finalState);

  // Type '1' directly into the textarea
  await textarea.pressSequentially('1');

  // Check the document model via WASM
  const modelState = await page.evaluate(() => {
    const snapshot = window.editor.wasmModule.getDocumentSnapshot();
    if (!snapshot || !snapshot.lines || !snapshot.lines[0]) {
      return { error: 'No document or lines', snapshot };
    }
    const cells = snapshot.lines[0].cells || [];
    return {
      cellCount: cells.length,
      firstCell: cells[0] ? {
        kind: cells[0].kind,
        pitch_code: cells[0].pitch_code,
        char: cells[0].char
      } : null,
      textareaValue: document.querySelector('.notation-textarea')?.value
    };
  });

  console.log('Model state after typing:', modelState);
  console.log('All logs:', logs);

  // Verify we have a pitched element with N1
  expect(modelState.cellCount).toBeGreaterThan(0);
  expect(modelState.firstCell).not.toBeNull();
  // kind can be a string or an object with name property
  const kindName = typeof modelState.firstCell.kind === 'string'
    ? modelState.firstCell.kind
    : modelState.firstCell.kind?.name;
  expect(kindName).toBe('pitched_element');
  expect(modelState.firstCell.pitch_code).toBe('N1');
});

test('File > New then typing 1 immediately produces N1', async ({ page }) => {
  // Go to app
  await page.goto('/');

  // Wait for WASM to initialize
  await expect(page.locator('.notation-editor')).toBeVisible();
  await page.waitForFunction(() => window.editor?.wasmModule?.getDocumentSnapshot);

  // Create new document via menu using keyboard
  await page.click('#file-menu-button');
  await page.click('#menu-new');

  // Wait for new document dialog if it appears
  await page.waitForTimeout(300);
  const dialog = page.locator('.new-document-dialog');
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    // Press Enter to accept default settings
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  }

  // Type '1' immediately without clicking - textarea should already be focused
  await page.keyboard.type('1');

  // Check the document model via WASM
  const modelState = await page.evaluate(() => {
    const snapshot = window.editor.wasmModule.getDocumentSnapshot();
    if (!snapshot || !snapshot.lines || !snapshot.lines[0]) {
      return { error: 'No document or lines', snapshot };
    }
    const cells = snapshot.lines[0].cells || [];
    return {
      cellCount: cells.length,
      firstPitchCode: cells[0]?.pitch_code
    };
  });

  // Verify we have N1
  expect(modelState.cellCount).toBe(1);
  expect(modelState.firstPitchCode).toBe('N1');
});

test('double-click selects a beat (word selection)', async ({ page }) => {
  // Go to app
  await page.goto('/');

  // Wait for WASM to initialize
  await expect(page.locator('.notation-editor')).toBeVisible();
  await page.waitForFunction(() => window.editor?.wasmModule?.getDocumentSnapshot);

  // Create new document
  await page.click('#file-menu-button');
  await page.click('#menu-new');

  await page.waitForTimeout(300);
  const dialog = page.locator('.new-document-dialog');
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
  }

  // Type "12 34" (two beats: "12" and "34")
  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible({ timeout: 5000 });
  await textarea.click();
  await textarea.pressSequentially('12 34');

  // Wait for WASM to process input
  await page.waitForTimeout(100);

  // Double-click on the second beat (position of "3" or "4")
  // Get bounding box of textarea and click in the right portion
  const box = await textarea.boundingBox();
  await page.mouse.dblclick(box.x + box.width * 0.7, box.y + box.height / 2);

  // Check that something got selected (browser word selection = beat selection)
  const afterState = await page.evaluate(() => {
    const ta = document.querySelector('.notation-textarea');
    return {
      selectionStart: ta?.selectionStart,
      selectionEnd: ta?.selectionEnd,
      value: ta?.value,
      valueLength: ta?.value?.length
    };
  });

  console.log('Selection state:', afterState);

  // Should have selected at least 1 character (beat selection working)
  // PUA glyphs may have different word boundary behavior
  expect(afterState.selectionEnd - afterState.selectionStart).toBeGreaterThan(0);
});

test('typing 123 produces cells in correct order [N1, N2, N3]', async ({ page }) => {
  // Go to app
  await page.goto('/');

  // Wait for WASM to initialize
  await expect(page.locator('.notation-editor')).toBeVisible();
  await page.waitForFunction(() => window.editor?.wasmModule?.getDocumentSnapshot);

  // Create new document via menu
  await page.click('#file-menu-button');
  await page.click('#menu-new');

  // Wait for new document dialog if it appears
  await page.waitForTimeout(300);
  const dialog = page.locator('.new-document-dialog');
  if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.click('.new-document-dialog button:has-text("Create")');
    await page.waitForTimeout(200);
  }

  // Wait for textarea to exist
  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible({ timeout: 5000 });

  // Click and focus the textarea
  await textarea.click();
  await textarea.focus();
  await page.waitForTimeout(100);

  // Type '123' directly into the textarea
  await textarea.pressSequentially('123');

  // Check the document model via WASM
  const modelState = await page.evaluate(() => {
    const snapshot = window.editor.wasmModule.getDocumentSnapshot();
    if (!snapshot || !snapshot.lines || !snapshot.lines[0]) {
      return { error: 'No document or lines', snapshot };
    }
    const cells = snapshot.lines[0].cells || [];
    return {
      cellCount: cells.length,
      pitchCodes: cells.map(c => c.pitch_code)
    };
  });

  // Verify we have 3 cells in correct order
  expect(modelState.cellCount).toBe(3);
  expect(modelState.pitchCodes).toEqual(['N1', 'N2', 'N3']);
});
