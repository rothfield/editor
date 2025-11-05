import { test, expect } from '@playwright/test';

test('All text cells render at 60% font size (19.2px)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();

  // Type multi-character text token "hello"
  await editor.click();
  await page.keyboard.type('hello');
  await page.waitForTimeout(300);

  // Check that cells were created
  const cells = await page.evaluate(() => {
    const doc = window.MusicNotationApp?.app()?.editor?.theDocument;
    if (!doc || !doc.lines || !doc.lines[0]) return null;
    return doc.lines[0].cells.map(c => ({
      char: c.char,
      continuation: c.continuation,
      kind: c.kind?.name
    }));
  });

  console.log('Cells:', JSON.stringify(cells, null, 2));

  // Verify cell structure: 'h' is root, 'e', 'l', 'l', 'o' are continuations
  expect(cells).toBeTruthy();
  expect(cells.length).toBe(5);
  expect(cells[0].char).toBe('h');
  expect(cells[0].continuation).toBe(false);
  expect(cells[0].kind).toBe('text');
  expect(cells[1].char).toBe('e');
  expect(cells[1].continuation).toBe(true);
  expect(cells[1].kind).toBe('text');

  // Check DOM structure to understand what's actually rendered
  const domInfo = await page.evaluate(() => {
    const containers = document.querySelectorAll('.cell-container');
    return {
      containerCount: containers.length,
      sampleContainerHTML: containers[0]?.innerHTML,
      sampleContainerClasses: containers[0]?.className
    };
  });
  console.log('DOM info:', JSON.stringify(domInfo, null, 2));

  // Get all spans inside cell-containers
  const fontSizes = await page.evaluate(() => {
    const containers = document.querySelectorAll('.cell-container');
    return Array.from(containers).map(container => {
      // Find the innermost span (cell-content > span)
      const cellContent = container.querySelector('.cell-content');
      const span = cellContent?.querySelector('span');
      return {
        char: span?.textContent,
        fontSize: span ? window.getComputedStyle(span).fontSize : null,
        classes: span?.className || ''
      };
    });
  });

  console.log('Font sizes:', JSON.stringify(fontSizes, null, 2));

  // ALL text cells ('h', 'e', 'l', 'l', 'o') should have 60% font size (19.2px)
  for (let i = 0; i < 5; i++) {
    expect(fontSizes[i].fontSize).toBe('19.2px');
    expect(fontSizes[i].classes).toContain('text-cell');
  }

  console.log('✓ All text cells are styled with 60% font size (19.2px)');
});
