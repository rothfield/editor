import { test, expect } from '@playwright/test';

test('Edit > Upper Octave with mouse selection should work', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');

  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();

  // Type a note
  await textarea.click();
  await page.keyboard.type('1');
  await page.waitForTimeout(200);

  // Select with mouse (triple-click to select line, or drag)
  await textarea.click({ clickCount: 3 });
  await page.waitForTimeout(100);

  // Check octave before
  const before = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.wasmModule?.getDocumentSnapshot?.();
    const cell = doc?.lines?.[0]?.cells?.[0];
    return { octave: cell?.octave, char: cell?.char };
  });
  console.log('Before upper octave:', JSON.stringify(before));

  // Click Edit menu then Upper Octave
  await page.locator('text=Edit').first().click();
  await page.waitForTimeout(100);

  const upperOctave = page.locator('#menu-octave-upper');
  await expect(upperOctave).toBeVisible();
  await upperOctave.click();
  await page.waitForTimeout(200);

  // Check octave after
  const after = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.wasmModule?.getDocumentSnapshot?.();
    const cell = doc?.lines?.[0]?.cells?.[0];
    return { octave: cell?.octave, char: cell?.char };
  });
  console.log('After upper octave:', JSON.stringify(after));

  // Print relevant logs
  const octaveLogs = logs.filter(l => l.toLowerCase().includes('octave') || l.includes('shiftOctave'));
  console.log('Octave logs:', octaveLogs);

  // Octave should have increased
  expect(after.octave).toBe((before.octave || 0) + 1);
});

test('Edit > Copy menu item should work', async ({ page }) => {
  // Collect console logs
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto('/');

  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();

  // Type and select
  await textarea.click();
  await page.keyboard.type('1 2 3');
  await page.waitForTimeout(200);

  // Select all with Ctrl+A
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(100);

  // Check WASM selection before menu
  const beforeMenu = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const wasm = app?.editor?.wasmModule;
    return {
      hasSelection: wasm?.getSelectionInfo?.()?.is_empty === false,
      clipboardCells: app?.editor?.clipboard?.cells?.length || 0
    };
  });
  console.log('Before copy:', JSON.stringify(beforeMenu, null, 2));
  expect(beforeMenu.hasSelection).toBe(true);

  // Click Edit menu then Copy
  const editMenu = page.locator('text=Edit').first();
  await editMenu.click();
  await page.waitForTimeout(100);

  const copyItem = page.locator('[data-testid="menu-copy"]');
  await expect(copyItem).toBeVisible();
  await copyItem.click();
  await page.waitForTimeout(200);

  // Check clipboard after copy
  const afterCopy = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    return {
      clipboardCells: app?.editor?.clipboard?.cells?.length || 0,
      clipboardText: app?.editor?.clipboard?.text || ''
    };
  });
  console.log('After copy:', JSON.stringify(afterCopy, null, 2));

  // Print relevant console logs
  const copyLogs = logs.filter(l => l.includes('copy') || l.includes('Copy') || l.includes('selection'));
  console.log('Copy-related logs:', copyLogs);

  // Should have copied cells
  expect(afterCopy.clipboardCells).toBeGreaterThan(0);
});
