import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

test('Debug: Check ALL cell contents with ornaments', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "2 3 4 1"
  await editor.click();
  await page.keyboard.type('2 3 4 1');
  await page.waitForTimeout(300);

  // Select first 3 and apply ornament
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  await page.keyboard.press('Alt+0');
  await page.waitForTimeout(500);

  // Get docmodel
  await openTab(page, 'tab-docmodel');
  const docmodel = await readPaneText(page, 'pane-docmodel');

  // Extract all cells
  const cellsMatch = docmodel.match(/cells:\n([\s\S]*?)\n      label:/);
  if (cellsMatch) {
    const cellsSection = cellsMatch[1];
    const cells = cellsSection.split('\n        -');

    console.log(`Total cells found: ${cells.length}`);

    // Count pitched cells
    const pitchedCount = (cellsSection.match(/pitched_element/g) || []).length;
    console.log(`Pitched elements: ${pitchedCount}`);

    // List what characters are in each cell
    const chars = [];
    let cellNum = 0;
    for (const cell of cells) {
      const charMatch = cell.match(/char:\s*"([^"]*?)"/);
      const kindMatch = cell.match(/kind:\s*\n\s*name:\s*"([^"]*?)"/);
      const ornMatch = cell.match(/ornament_indicator:\s*\n\s*name:\s*"([^"]*?)"/);

      if (charMatch && kindMatch) {
        const char = charMatch[1] || '(empty)';
        const kind = kindMatch[1];
        const orn = ornMatch ? ornMatch[1] : 'none';
        console.log(`Cell ${cellNum}: "${char}" (${kind}) [orn: ${orn}]`);
        chars.push(char);
        cellNum++;
      }
    }

    console.log(`Character sequence: [${chars.join(', ')}]`);
  }

  expect(docmodel.length).toBeGreaterThan(0);
});
