import { test, expect } from '@playwright/test';

test('ornament: Alt+Shift+O to toggle ornament mode', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type some content
  await page.keyboard.type('456');
  await page.waitForTimeout(200);

  // Check initial mode display
  const modeIndicator = page.locator('text=Edit Ornament Mode');
  await expect(modeIndicator).toBeVisible();
  let modeText = await modeIndicator.textContent();
  console.log('Mode before Alt+Shift+O:', modeText);
  expect(modeText).toContain('OFF');

  // Try Alt+O to enter ornament mode
  console.log('\nPressing Alt+O...');
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(500);

  // Check mode display after Alt+O
  modeText = await modeIndicator.textContent();
  console.log('Mode after Alt+O:', modeText);

  if (modeText.includes('ON')) {
    console.log('✓ Ornament mode is ON');
  } else {
    console.log('✗ Ornament mode is still OFF');
  }

  expect(modeText).toContain('ON');

  // Now test Shift+Left Arrow to extend selection
  console.log('\nTesting Shift+Left Arrow for selection...');
  await page.keyboard.press('End');  // Go to end
  await page.waitForTimeout(100);

  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  const selection = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const sel = app.editor.getSelection();
    return {
      start: sel.start,
      end: sel.end,
      text: app.editor.getSelectedText()
    };
  });

  console.log('Selection after Shift+Left Arrow:', selection);
  expect(selection.text.length).toBeGreaterThan(0);
});
