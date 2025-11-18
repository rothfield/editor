import { test, expect } from '@playwright/test';

test('Verify constraints dialog fixes: notes display and checkmark', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  await page.waitForFunction(() => window.editor && window.editor.wasmModule, { timeout: 10000 });

  // Open dialog
  await page.evaluate(() => {
    if (window.editor && window.editor.ui && window.editor.ui.constraintsDialog) {
      window.editor.ui.constraintsDialog.open();
    }
  });

  await page.waitForTimeout(500);

  // Find and click Ionian card
  const ionianCard = page.locator('.constraints-card').filter({ hasText: 'Ionian' }).first();
  await expect(ionianCard).toBeVisible();

  // Take screenshot before selection
  await page.screenshot({
    path: 'test-results/constraints-before-select.png',
    clip: { x: 0, y: 0, width: 1280, height: 800 }
  });

  // Click to select
  await ionianCard.click();
  await page.waitForTimeout(300);

  // Verify notes display
  const notesDisplay = ionianCard.locator('.constraints-card-notes');
  await expect(notesDisplay).toBeVisible();
  const notesText = await notesDisplay.textContent();

  console.log('[Test] Notes displayed:', notesText);
  expect(notesText).toContain('1');
  expect(notesText).toContain('7');

  // Verify checkmark appears (and is NOT "271")
  const checkCircle = ionianCard.locator('.constraints-card-check');
  await expect(checkCircle).toBeVisible();
  const checkText = await checkCircle.textContent();

  console.log('[Test] Check circle text:', JSON.stringify(checkText));

  // The check circle should show a checkmark (✓) or be empty for selected state
  // It should NOT show "271"
  expect(checkText).not.toContain('271');

  // Take screenshot after selection
  await page.screenshot({
    path: 'test-results/constraints-after-select.png',
    clip: { x: 0, y: 0, width: 1280, height: 800 }
  });

  // Test pitch system selector
  const pitchSystemSelect = page.locator('#constraints-pitch-system-select');
  await pitchSystemSelect.selectOption('Western');
  await page.waitForTimeout(500);

  const westernNotes = await notesDisplay.textContent();
  console.log('[Test] Western notes:', westernNotes);
  expect(westernNotes).toContain('C');
  expect(westernNotes).toContain('B');

  // Switch to Sargam
  await pitchSystemSelect.selectOption('Sargam');
  await page.waitForTimeout(500);

  const sargamNotes = await notesDisplay.textContent();
  console.log('[Test] Sargam notes:', sargamNotes);
  expect(sargamNotes).toContain('Sa');
  expect(sargamNotes).toContain('Ni');

  // Take final screenshot with Sargam
  await page.screenshot({
    path: 'test-results/constraints-sargam.png',
    clip: { x: 0, y: 0, width: 1280, height: 800 }
  });

  console.log('[Test] ✅ All fixes verified');
});
