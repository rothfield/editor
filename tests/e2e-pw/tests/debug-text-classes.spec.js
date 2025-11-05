import { test, expect } from '@playwright/test';

test('Check text cell classes and styles', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type text token "hello"
  await editor.click();
  await page.keyboard.type('hello');
  await page.waitForTimeout(300);

  // Get all cell classes and computed styles
  const cellInfo = await page.evaluate(() => {
    const containers = document.querySelectorAll('.cell-container');
    return Array.from(containers).map(container => {
      const span = container.querySelector('.char-cell');
      const computed = span ? window.getComputedStyle(span) : null;
      return {
        char: span?.textContent,
        classes: span?.className,
        classList: Array.from(span?.classList || []),
        fontSize: computed?.fontSize,
        verticalAlign: computed?.verticalAlign,
        lineHeight: computed?.lineHeight,
        hasOrnamentClass: span?.classList.contains('ornament-cell') || 
                          span?.classList.contains('ornament-first') ||
                          span?.classList.contains('ornament-middle') ||
                          span?.classList.contains('ornament-last')
      };
    });
  });

  console.log('Cell info:', JSON.stringify(cellInfo, null, 2));

  // Check first cell (should be text)
  expect(cellInfo[0].hasOrnamentClass).toBe(false);
  expect(cellInfo[0].fontSize).toBe('19.2px');
});
