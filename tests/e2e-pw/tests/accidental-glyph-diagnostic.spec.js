import { test, expect } from '@playwright/test';

test('Diagnostic: Show accidental glyph rendering', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type test input
  await editor.click();
  await page.keyboard.type('1# 2b 3## 4bb');

  // Get all pitched cells
  const pitchedCells = await page.locator('.char-cell.kind-pitched').all();
  console.log(`\n=== DIAGNOSTIC OUTPUT ===`);
  console.log(`Total pitched cells: ${pitchedCells.length}`);

  // Check each cell
  for (let i = 0; i < pitchedCells.length; i++) {
    const cell = pitchedCells[i];
    const text = await cell.innerText();
    const dataAccidental = await cell.getAttribute('data-accidental');
    const codePoint = text.charCodeAt(0);
    const codePointHex = '0x' + codePoint.toString(16).toUpperCase();

    // Get computed styles for ::after
    const styles = await cell.evaluate((el) => {
      const computed = window.getComputedStyle(el, '::after');
      return {
        content: computed.content,
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        position: computed.position,
        left: computed.left,
        top: computed.top,
      };
    });

    console.log(`\nCell ${i}:`);
    console.log(`  Text: "${text}"`);
    console.log(`  Code point: ${codePointHex} (${codePoint})`);
    console.log(`  data-accidental: ${dataAccidental}`);
    if (dataAccidental) {
      console.log(`  ::after styles:`);
      console.log(`    content: ${styles.content}`);
      console.log(`    display: ${styles.display}`);
      console.log(`    visibility: ${styles.visibility}`);
      console.log(`    left: ${styles.left}`);
      console.log(`    top: ${styles.top}`);
    }
  }

  // Take screenshot
  await page.screenshot({ path: 'artifacts/diagnostic-glyphs.png' });
});
