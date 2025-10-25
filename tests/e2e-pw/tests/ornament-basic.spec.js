// Ornament Feature - Basic E2E Test
// Tests the complete workflow: type notes -> add ornament -> verify rendering

import { test, expect } from '@playwright/test';

test.describe('Ornament Feature - Basic Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForSelector('#notation-editor', { state: 'visible' });
    await page.waitForTimeout(2000); // Wait for WASM to load
  });

  test('complete ornament workflow - type notes, add ornament, verify saved', async ({ page }) => {
    // Capture console logs from the start
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    // Step 1: Type some notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.waitForTimeout(500);

    // Verify notes were typed
    const cells = await page.locator('.char-cell').all();
    expect(cells.length).toBeGreaterThan(0);

    // Step 2: Position cursor on first note
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Step 3: Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForTimeout(500);

    // Verify dialog opened
    await expect(page.locator('#ornament-editor-dialog')).toBeVisible();

    // Verify dialog has correct title
    const dialogTitle = await page.locator('#ornament-editor-header h3').textContent();
    expect(dialogTitle).toBe('Create Ornament');

    // Step 4: Type ornament pitches in mini canvas
    await page.click('#ornament-mini-canvas');
    await page.waitForTimeout(200);
    await page.keyboard.type('gr');
    await page.waitForTimeout(500);

    // Verify cells were created in mini canvas
    const miniCells = await page.locator('#ornament-mini-canvas .char-cell').all();
    expect(miniCells.length).toBe(2);

    // Step 5: Save ornament with Enter key
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify dialog closed
    await expect(page.locator('#ornament-editor-dialog')).not.toBeVisible();

    // Step 6: Verify ornament was added to document
    console.log('[TEST] Console logs from browser:');
    logs.filter(log => log.includes('Ornament')).forEach(log => console.log('[TEST]', log));

    // The ornament should be saved - we can verify by checking the document structure
    // or by looking for ornament containers in the rendered output
    const ornamentContainers = await page.locator('.ornament-container').all();
    console.log('[TEST] Found', ornamentContainers.length, 'ornament containers');
    expect(ornamentContainers.length).toBeGreaterThanOrEqual(1);
  });

  test('ornament editor shows error when no notes exist', async ({ page }) => {
    // Capture console errors - set up before any actions
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Try to open ornament editor without typing any notes
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForTimeout(500); // Wait longer for error to be logged

    // Should show error message in console
    // The actual error is about no note at cursor, not no line
    const hasExpectedError = errors.some(err =>
      err.includes('No note at cursor - position cursor after a note to add an ornament') ||
      err.includes('Please type some notes first before adding ornaments')
    );

    // Debug: log all errors if test fails
    if (!hasExpectedError) {
      console.log('[TEST] Captured errors:', errors);
    }

    expect(hasExpectedError).toBeTruthy();
  });

  test('can cancel ornament editor with Escape', async ({ page }) => {
    // Type notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForTimeout(500);

    // Dialog should be open
    await expect(page.locator('#ornament-editor-dialog')).toBeVisible();

    // Type something
    await page.click('#ornament-mini-canvas');
    await page.keyboard.type('gr');
    await page.waitForTimeout(300);

    // Cancel with Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Dialog should be closed
    await expect(page.locator('#ornament-editor-dialog')).not.toBeVisible();

    // No ornament should be added
    const ornamentContainers = await page.locator('.ornament-container').all();
    expect(ornamentContainers.length).toBe(0);
  });

  test('can change ornament placement', async ({ page }) => {
    // Type notes
    await page.click('#notation-editor');
    await page.keyboard.type('srgm');
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);

    // Open ornament editor
    await page.click('#edit-menu-button');
    await page.waitForTimeout(200);
    await page.click('#menu-ornament');
    await page.waitForTimeout(500);

    // Default should be After
    const afterRadio = page.locator('input[name="placement"][value="After"]');
    await expect(afterRadio).toBeChecked();

    // Change to Before
    await page.click('input[name="placement"][value="Before"]');
    await page.waitForTimeout(200);

    const beforeRadio = page.locator('input[name="placement"][value="Before"]');
    await expect(beforeRadio).toBeChecked();

    // Type ornament and save
    await page.click('#ornament-mini-canvas');
    await page.keyboard.type('gr');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify ornament was created
    const ornamentContainers = await page.locator('.ornament-container').all();
    expect(ornamentContainers.length).toBeGreaterThanOrEqual(1);
  });
});
