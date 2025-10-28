import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Check beat structure - are ornament cells in same beat as main notes?', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  // Type "4 5 6"
  await editor.click();
  await page.keyboard.type('4 5 6');
  await page.waitForTimeout(300);

  console.log('Typed: "4 5 6"');

  // Select "5 6" (backward from end)
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.waitForTimeout(200);

  console.log('Selected "5 6" and applied Alt+0');

  // Apply ornament
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Check docmodel for beat structure
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Extract beats section
  const beatsMatch = docmodel.match(/beats:\s*\n([\s\S]*?)(?:\n\s*pitch_system|\n\s*\})/);
  if (beatsMatch) {
    console.log('\n=== Beat Structure ===');
    const beatsStr = beatsMatch[1];
    const beats = beatsStr.split(/\n\s+-\n/);

    beats.forEach((beat, idx) => {
      const startMatch = beat.match(/start:\s*(\d+)/);
      const endMatch = beat.match(/end:\s*(\d+)/);

      if (startMatch && endMatch) {
        const start = startMatch[1];
        const end = endMatch[1];
        console.log(`Beat ${idx}: cells [${start}..${end}]`);
      }
    });
  }

  // Extract cells
  const cellsMatch = docmodel.match(/cells:\s*\n([\s\S]*?)(?:\n\s*label:|\n\s*beats:)/);
  if (cellsMatch) {
    console.log('\n=== All Cells ===');
    const cellsStr = cellsMatch[1];
    const cells = cellsStr.split(/\n\s+-\n/);

    cells.forEach((cell, idx) => {
      const charMatch = cell.match(/char:\s*"([^"]*?)"/);
      const ornMatch = cell.match(/ornament_indicator:[\s\S]*?name:\s*"([^"]*?)"/);

      const char = charMatch ? charMatch[1] : '?';
      const orn = ornMatch ? ornMatch[1] : 'none';

      console.log(`Cell ${idx}: "${char}" (orn: ${orn})`);
    });
  }

  expect(docmodel.length).toBeGreaterThan(0);
});
