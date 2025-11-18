import { test, expect } from '@playwright/test';

test('Debug constraints notes rendering', async ({ page }) => {
  page.on('console', msg => console.log('[BROWSER]', msg.text()));

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

  // Get Ionian card
  const ionianCard = page.locator('.constraints-card').filter({ hasText: 'Ionian' }).first();
  await expect(ionianCard).toBeVisible();
  await ionianCard.click();

  await page.waitForTimeout(500);

  const notesDisplay = ionianCard.locator('.constraints-card-notes');
  await expect(notesDisplay).toBeVisible();

  // Get all diagnostic info
  const diagnostics = await notesDisplay.evaluate(el => {
    const text = el.textContent;
    const codes = Array.from(text).map(c => ({
      char: c,
      code: c.charCodeAt(0),
      hex: c.charCodeAt(0).toString(16).padStart(4, '0')
    }));

    const styles = window.getComputedStyle(el);

    return {
      textContent: text,
      innerHTML: el.innerHTML,
      charCodes: codes,
      fontFamily: styles.fontFamily,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight
    };
  });

  console.log('\n===== DIAGNOSTICS =====');
  console.log('Text Content:', JSON.stringify(diagnostics.textContent));
  console.log('Inner HTML:', diagnostics.innerHTML);
  console.log('Font Family:', diagnostics.fontFamily);
  console.log('Font Size:', diagnostics.fontSize);
  console.log('\nCharacter Breakdown:');
  diagnostics.charCodes.forEach((c, i) => {
    console.log(`  [${i}] "${c.char}" = U+${c.hex} (decimal ${c.code})`);
  });
  console.log('======================\n');

  // Take a screenshot
  await page.screenshot({ path: 'test-results/constraints-notes-debug.png', fullPage: true });
});
