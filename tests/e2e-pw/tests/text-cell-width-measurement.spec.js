import { test, expect } from '@playwright/test';

test('Text cell measured width should match rendered width', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type text token "hello"
  await editor.click();
  await page.keyboard.type('hello');
  await page.waitForTimeout(300);

  // Get measured widths from WASM DisplayList (what layout engine calculated)
  const measuredWidths = await page.evaluate(() => {
    const displayList = window.MusicNotationApp?.app()?.editor?.displayList;
    if (!displayList || !displayList.lines || !displayList.lines[0]) return null;

    return displayList.lines[0].cells.map(cell => ({
      char: cell.char,
      measuredWidth: cell.w,
      x: cell.x
    }));
  });

  console.log('Measured widths from DisplayList:', JSON.stringify(measuredWidths, null, 2));

  // Get actual rendered widths from DOM (what user sees)
  const renderedWidths = await page.evaluate(() => {
    const containers = document.querySelectorAll('.cell-container');
    return Array.from(containers).map(container => {
      const cellContent = container.querySelector('.cell-content');
      const span = cellContent?.querySelector('span');
      const rect = span?.getBoundingClientRect();
      return {
        char: span?.textContent,
        renderedWidth: rect ? rect.width : null,
        fontSize: span ? window.getComputedStyle(span).fontSize : null
      };
    });
  });

  console.log('Rendered widths from DOM:', JSON.stringify(renderedWidths, null, 2));

  // Compare measured vs rendered for each character
  expect(measuredWidths.length).toBe(renderedWidths.length);

  for (let i = 0; i < measuredWidths.length; i++) {
    const measured = measuredWidths[i].measuredWidth;
    const rendered = renderedWidths[i].renderedWidth;
    const char = measuredWidths[i].char;

    console.log(`Character '${char}': measured=${measured.toFixed(2)}px, rendered=${rendered.toFixed(2)}px, diff=${(measured - rendered).toFixed(2)}px`);

    // Assert they should match (within 2px tolerance for rounding)
    // This will FAIL initially because measured width is at 32px font, rendered is at 19.2px font
    expect(Math.abs(measured - rendered)).toBeLessThan(2);
  }

  console.log('✓ All text cell measured widths match rendered widths');
});
