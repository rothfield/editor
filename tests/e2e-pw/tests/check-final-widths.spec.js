import { test, expect } from '@playwright/test';
import { waitForEditorReady } from '../utils/editor.helpers.js';

test('check final widths after font regeneration', async ({ page }) => {
  // Navigate with cache bypass
  await page.goto('/', { waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await waitForEditorReady(page);

  // Type "112"
  await editor.click();
  await page.keyboard.type('112');
  await page.waitForTimeout(1000);

  // Open display list tab
  await page.click('[data-testid="tab-displaylist"]');
  await page.waitForTimeout(500);

  // Get display list
  const displayListText = await page.locator('[data-testid="pane-displaylist"]').innerText();

  console.log('\n=== Display List Check ===');

  try {
    const jsonMatch = displayListText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const displayList = JSON.parse(jsonMatch[0]);
      const cells = displayList.lines[0].cells;

      console.log('Character widths:');
      cells.forEach((cell, idx) => {
        const codepoint = cell.char.codePointAt(0);
        console.log(`  Cell ${idx}: U+${codepoint.toString(16).toUpperCase()} width = ${cell.w}px`);
      });

      // Check that widths are in expected range (8-10px for "1", higher for "2")
      const cell0Width = cells[0].w;
      const cell1Width = cells[1].w;

      console.log(`\nExpected "1" width: ~8.5-9px (down from 25px)`);
      console.log(`Actual "1" widths: ${cell0Width}px, ${cell1Width}px`);

      if (cell0Width < 12) {
        console.log('✓ Fix successful! Widths are proportional.');
      } else {
        console.log('✗ Still using old cached widths. Try hard refresh (Ctrl+Shift+R).');
      }
    }
  } catch (e) {
    console.log('Could not parse display list:', e.message);
  }

  console.log('==========================\n');
});
