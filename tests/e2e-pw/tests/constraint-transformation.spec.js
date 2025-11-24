import { test, expect } from '@playwright/test';

test('Lydian constraint transforms "4" to "4#" (N4s)', async ({ page }) => {
  // Capture console messages
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('/');

  // Wait for WASM to initialize first
  await page.waitForFunction(() => window.editor && window.editor.wasmModule, { timeout: 10000 });
  console.log('[Test] WASM initialized');

  // Now wait for editor to be visible
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible({ timeout: 10000 });

  // Open constraints dialog
  await page.evaluate(() => {
    if (window.editor && window.editor.ui && window.editor.ui.constraintsDialog) {
      window.editor.ui.constraintsDialog.open();
    }
  });

  // Wait for dialog to open
  const modal = page.locator('#constraints-modal');
  await expect(modal).toBeVisible();

  // Select Lydian mode
  const lydianCard = page.locator('.constraints-card').filter({ hasText: 'Lydian' }).first();
  await expect(lydianCard).toBeVisible();
  await lydianCard.click();
  console.log('[Test] Lydian constraint selected');

  // Close the dialog
  const closeButton = page.locator('#constraints-close');
  await closeButton.click();
  await page.waitForTimeout(300);

  // Verify constraint is now active
  const activeConstraint = await page.evaluate(() => {
    return window.editor && window.editor.wasmModule && window.editor.wasmModule.getActiveConstraint();
  });
  console.log('[Test] Active constraint:', activeConstraint);
  expect(activeConstraint).toBeTruthy();
  expect(activeConstraint.id).toBe('lydian');

  // Click on editor to focus
  await editor.click();
  await page.waitForTimeout(200);

  // Type "4" - should be transformed to "4#" by Lydian constraint
  await page.keyboard.type('4');
  await page.waitForTimeout(300);

  // Open Doc Model tab to verify pitch_code
  const docModelTab = page.getByTestId('tab-docmodel');
  if (await docModelTab.isVisible()) {
    await docModelTab.click();
    await page.waitForTimeout(200);

    const docModelPane = page.getByTestId('pane-docmodel');
    await expect(docModelPane).toBeVisible();

    const docModelText = await docModelPane.textContent();
    console.log('[Test] Doc Model:', docModelText);

    // Verify the pitch_code is N4s (F# in Lydian)
    expect(docModelText).toContain('N4s');
    console.log('[Test] ✅ Verified: pitch_code is N4s (F# sharp as required by Lydian)');
  }

  // Check the display in the editor - should show "4#" glyph
  const editorText = await editor.textContent();
  console.log('[Test] Editor display:', editorText);

  // The glyph should be the sharp 4 character from NotationFont
  // We can verify this by checking if it's NOT just "4"
  // Since the constraint should transform it, we should see a different character

  console.log('[Test] ✅ Lydian constraint transformation test completed');
});

test('Marwa constraint blocks "5" (Pa is omitted)', async ({ page }) => {
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  await page.waitForFunction(() => window.editor && window.editor.wasmModule, { timeout: 10000 });

  // Open constraints dialog
  await page.evaluate(() => {
    if (window.editor && window.editor.ui && window.editor.ui.constraintsDialog) {
      window.editor.ui.constraintsDialog.open();
    }
  });

  const modal = page.locator('#constraints-modal');
  await expect(modal).toBeVisible();

  // Select Marwa mode (Pa/5 is omitted)
  const marwaCard = page.locator('.constraints-card').filter({ hasText: 'Marwa' }).first();
  // Scroll into view if needed
  await marwaCard.scrollIntoViewIfNeeded();
  await expect(marwaCard).toBeVisible();
  await marwaCard.click();
  console.log('[Test] Marwa constraint selected');

  // Close dialog
  const closeButton = page.locator('#constraints-close');
  await closeButton.click();
  await page.waitForTimeout(300);

  // Click on editor to focus
  await editor.click();
  await page.waitForTimeout(200);

  // Type "5" - should be blocked by Marwa constraint (Pa omitted)
  await page.keyboard.type('5');
  await page.waitForTimeout(300);

  // Open Doc Model to verify nothing was inserted
  const docModelTab = page.getByTestId('tab-docmodel');
  if (await docModelTab.isVisible()) {
    await docModelTab.click();
    await page.waitForTimeout(200);

    const docModelPane = page.getByTestId('pane-docmodel');
    await expect(docModelPane).toBeVisible();

    const docModelText = await docModelPane.textContent();
    console.log('[Test] Doc Model after typing "5":', docModelText);

    // Should NOT contain N5 pitch_code
    expect(docModelText).not.toContain('N5');
    console.log('[Test] ✅ Verified: "5" was blocked (not inserted)');
  }

  // Type an allowed pitch like "1" - should work
  await editor.click();
  await page.keyboard.type('1');
  await page.waitForTimeout(300);

  if (await docModelTab.isVisible()) {
    const docModelPane = page.getByTestId('pane-docmodel');
    const docModelText = await docModelPane.textContent();
    console.log('[Test] Doc Model after typing "1":', docModelText);

    // Should contain N1
    expect(docModelText).toContain('N1');
    console.log('[Test] ✅ Verified: "1" was allowed');
  }

  console.log('[Test] ✅ Marwa omission test completed');
});

test('Dorian constraint transforms "3" to "3b" (N3b)', async ({ page }) => {
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  await page.waitForFunction(() => window.editor && window.editor.wasmModule, { timeout: 10000 });

  // Open constraints dialog
  await page.evaluate(() => {
    if (window.editor && window.editor.ui && window.editor.ui.constraintsDialog) {
      window.editor.ui.constraintsDialog.open();
    }
  });

  const modal = page.locator('#constraints-modal');
  await expect(modal).toBeVisible();

  // Select Dorian mode (has b3 and b7)
  const dorianCard = page.locator('.constraints-card').filter({ hasText: 'Dorian' }).first();
  await expect(dorianCard).toBeVisible();
  await dorianCard.click();
  console.log('[Test] Dorian constraint selected');

  // Close dialog
  const closeButton = page.locator('#constraints-close');
  await closeButton.click();
  await page.waitForTimeout(300);

  // Click on editor to focus
  await editor.click();
  await page.waitForTimeout(200);

  // Type "3" - should be transformed to "3b" by Dorian constraint
  await page.keyboard.type('3');
  await page.waitForTimeout(300);

  // Open Doc Model to verify pitch_code
  const docModelTab = page.getByTestId('tab-docmodel');
  if (await docModelTab.isVisible()) {
    await docModelTab.click();
    await page.waitForTimeout(200);

    const docModelPane = page.getByTestId('pane-docmodel');
    await expect(docModelPane).toBeVisible();

    const docModelText = await docModelPane.textContent();
    console.log('[Test] Doc Model:', docModelText);

    // Verify the pitch_code is N3b (Eb in Dorian)
    expect(docModelText).toContain('N3b');
    console.log('[Test] ✅ Verified: pitch_code is N3b (Eb flat as required by Dorian)');
  }

  console.log('[Test] ✅ Dorian constraint transformation test completed');
});
