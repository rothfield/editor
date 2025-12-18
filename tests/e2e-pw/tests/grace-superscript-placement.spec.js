import { test, expect } from '@playwright/test';

/**
 * Test case: Visual placement of superscripts in "1²³ ⁴56"
 *
 * Expected visual layout:
 * - Beat 1: "1" with superscripts "²³" positioned AFTER (to the right of) "1"
 * - Beat 2: superscript "⁴" positioned BEFORE (to the left of) "5", then "6"
 *
 * The superscripts should visually attach to their anchor notes.
 */
test('Superscript placement: 1²³ ⁴56 - check visual positions', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    logs.push('[' + msg.type() + '] ' + msg.text());
  });

  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Type "123 456"
  await page.keyboard.type('123 456');
  await page.waitForTimeout(200);

  // Make "23" into superscripts (after-grace of 1)
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight'); // past 1
  await page.keyboard.press('Shift+ArrowRight'); // select 2
  await page.keyboard.press('Shift+ArrowRight'); // select 3
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(300);

  // Make "4" into superscript (before-grace of 5)
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft'); // before 6
  await page.keyboard.press('ArrowLeft'); // before 5
  await page.keyboard.press('Shift+ArrowLeft'); // select 4
  await page.waitForTimeout(100);
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(500);

  // Get cell positions from document model
  const cellInfo = await page.evaluate(() => {
    const app = window.MusicNotationApp?.app();
    const doc = app?.editor?.getDocument?.();
    if (!doc || !doc.lines?.[0]) return { error: 'no doc' };

    const cells = doc.lines[0].cells || [];
    return {
      cellCount: cells.length,
      cells: cells.map((c, i) => ({
        index: i,
        char: c.char,
        charCode: c.char?.charCodeAt(0),
        pitch_code: c.pitch_code,
        is_superscript: c.is_superscript,
        kind: c.kind?.name || c.kind
      }))
    };
  });
  console.log('=== Document Cells ===');
  console.log(JSON.stringify(cellInfo, null, 2));

  // Get visual positions of rendered elements
  const visualPositions = await page.evaluate(() => {
    // Try different selectors to find rendered notation elements
    const selectors = [
      '.notation-cell',
      '.cell',
      '[data-cell]',
      '.notation-line span',
      '#notation-editor span'
    ];

    let elements = [];
    for (const sel of selectors) {
      elements = document.querySelectorAll(sel);
      if (elements.length > 0) {
        console.log('Found elements with selector:', sel, 'count:', elements.length);
        break;
      }
    }

    // Also check the textarea content
    const textarea = document.querySelector('.notation-textarea');
    const textareaValue = textarea?.value || '';
    console.log('Textarea value:', textareaValue);
    console.log('Textarea chars:', [...textareaValue].map(c => c.charCodeAt(0).toString(16)));

    const positions = [];
    elements.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const text = el.textContent || '';
      positions.push({
        index: i,
        text: text,
        charCode: text.charCodeAt(0),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        classes: el.className,
        tagName: el.tagName
      });
    });
    return { positions, textareaValue };
  });
  console.log('=== Visual Positions ===');
  console.log(JSON.stringify(visualPositions, null, 2));

  // Take screenshot of notation area
  await page.screenshot({ path: 'artifacts/grace-superscript-placement.png', fullPage: true });

  // Print logs
  const relevantLogs = logs.filter(l =>
    l.includes('superscript') || l.includes('grace') || l.includes('placement') ||
    l.includes('position') || l.includes('anchor') || l.includes('Textarea')
  );
  console.log('=== Relevant Logs ===');
  for (const log of relevantLogs) {
    console.log(log);
  }

  // CRITICAL: Check that the anchor note N1 is still in the textarea
  // Bug: The anchor note "1" disappears when following notes become superscripts
  const textareaChars = [...visualPositions.textareaValue];
  console.log('Textarea character count:', textareaChars.length);
  console.log('Textarea char codes:', textareaChars.map(c => c.charCodeAt(0)));

  // Document has 7 cells, textarea should have 7 characters
  // (or 6 if space is being collapsed, but anchor notes must be present)
  console.log('Document cell count:', cellInfo.cellCount);

  // Find the N1 anchor note in document
  const n1Cell = cellInfo.cells?.find(c => c.pitch_code === 'N1');
  console.log('N1 cell in document:', n1Cell);

  // Check if N1's character appears in textarea
  const n1CharCode = n1Cell?.charCode;
  const n1InTextarea = textareaChars.some(c => c.charCodeAt(0) === n1CharCode);
  console.log(`N1 charCode (${n1CharCode}) in textarea: ${n1InTextarea}`);

  // The anchor note N1 MUST be present in textarea
  expect(n1InTextarea).toBe(true);

  // Also verify superscripts are correctly marked
  const superscriptCells = cellInfo.cells?.filter(c => c.kind === 'upper_annotation') || [];
  console.log('Superscript cells (upper_annotation) in document:', superscriptCells.length);
  expect(superscriptCells.length).toBe(3); // 2, 3, 4 should all be superscripts

  // Check document order: superscript 4 should come BEFORE pitch 5
  const cell4Index = cellInfo.cells?.findIndex(c => c.pitch_code === 'N4');
  const cell5Index = cellInfo.cells?.findIndex(c => c.pitch_code === 'N5');
  console.log(`Document order: N4 at index ${cell4Index}, N5 at index ${cell5Index}`);
  expect(cell4Index).toBeLessThan(cell5Index);
});
