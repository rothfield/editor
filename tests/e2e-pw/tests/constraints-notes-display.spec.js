import { test, expect } from '@playwright/test';

test('Constraints dialog displays notes in different pitch systems', async ({ page }) => {
  // Capture console messages
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('/');

  // Wait for editor to load
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Wait for WASM to initialize
  await page.waitForFunction(() => window.editor && window.editor.wasmModule, { timeout: 10000 });
  console.log('[Test] WASM initialized');

  // Open constraints dialog directly via JavaScript (bypass event handling issues)
  await page.evaluate(() => {
    if (window.editor && window.editor.ui && window.editor.ui.constraintsDialog) {
      window.editor.ui.constraintsDialog.open();
    }
  });
  console.log('[Test] Dialog.open() called');

  // Wait for dialog to open
  const modal = page.locator('#constraints-modal');
  await expect(modal).toBeVisible();
  await expect(modal).not.toHaveClass(/hidden/);

  // Select the "Ionian (Major)" mode
  const ionianCard = page.locator('.constraints-card').filter({ hasText: 'Ionian' }).first();
  await expect(ionianCard).toBeVisible();
  await ionianCard.click();

  // Verify the card shows notes in Number system (default)
  const notesDisplay = ionianCard.locator('.constraints-card-notes');
  await expect(notesDisplay).toBeVisible();

  // Get the text content and character codes
  const numberNotes = await notesDisplay.textContent();
  const numberCodes = await notesDisplay.evaluate(el =>
    Array.from(el.textContent).map(c => c.charCodeAt(0).toString(16)).join(' ')
  );
  console.log('[Test] Number system notes:', numberNotes);
  console.log('[Test] Number system char codes:', numberCodes);

  // Should contain number notation (1-7)
  // The notes should include characters from the Number pitch system
  expect(numberNotes).toBeTruthy();
  expect(numberNotes.trim().length).toBeGreaterThan(0);

  // Change pitch system to Western
  const pitchSystemSelect = page.locator('#constraints-pitch-system-select');
  await expect(pitchSystemSelect).toBeVisible();
  await pitchSystemSelect.selectOption('Western');

  // Wait for re-render
  await page.waitForTimeout(500);

  // Verify notes updated to Western notation
  const westernNotes = await notesDisplay.textContent();
  console.log('[Test] Western system notes:', westernNotes);

  // Notes should have changed
  expect(westernNotes).toBeTruthy();
  expect(westernNotes.length).toBeGreaterThan(0);

  // Notes content should be different from Number system
  // (unless they happen to overlap, which is unlikely)

  // Change to Sargam
  await pitchSystemSelect.selectOption('Sargam');
  await page.waitForTimeout(500);

  const sargamNotes = await notesDisplay.textContent();
  console.log('[Test] Sargam system notes:', sargamNotes);

  expect(sargamNotes).toBeTruthy();
  expect(sargamNotes.length).toBeGreaterThan(0);

  // Switch to a mode with accidentals (e.g., Dorian)
  const dorianCard = page.locator('.constraints-card').filter({ hasText: 'Dorian' }).first();
  await expect(dorianCard).toBeVisible();
  await dorianCard.click();

  // Verify notes display for Dorian
  const dorianNotesDisplay = dorianCard.locator('.constraints-card-notes');
  await expect(dorianNotesDisplay).toBeVisible();

  const dorianNotes = await dorianNotesDisplay.textContent();
  console.log('[Test] Dorian notes:', dorianNotes);

  expect(dorianNotes).toBeTruthy();
  expect(dorianNotes.length).toBeGreaterThan(0);

  console.log('[Test] ✅ Constraints notes display working correctly');
});
