import { test } from '@playwright/test';

test('check display list widths for "11"', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for app to load
  await page.waitForSelector('#editor-root', { state: 'visible', timeout: 10000 });

  // Type "11"
  await page.click('#editor-root');
  await page.keyboard.type('11');

  // Wait a bit for layout
  await page.waitForTimeout(1000);

  // Click on DisplayList tab
  const displayListTab = page.locator('[data-testid="tab-displaylist"]');
  await displayListTab.click();

  // Get the display list text
  const displayListText = await page.locator('[data-testid="pane-displaylist"]').innerText();

  console.log('=== Display List Content ===');
  console.log(displayListText);

  // Extract width values from JSON
  try {
    const jsonMatch = displayListText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const displayList = JSON.parse(jsonMatch[0]);
      if (displayList.lines && displayList.lines[0] && displayList.lines[0].cells) {
        const cells = displayList.lines[0].cells;
        console.log('\n=== Cell Widths ===');
        cells.forEach((cell, idx) => {
          console.log(`Cell ${idx}: char="${cell.char}" (U+${cell.char.codePointAt(0).toString(16).toUpperCase()}), width=${cell.w}px, x=${cell.x}px`);
        });
      }
    }
  } catch (e) {
    console.log('Could not parse JSON:', e.message);
  }
});
