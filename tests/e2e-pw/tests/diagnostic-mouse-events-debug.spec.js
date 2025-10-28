import { test, expect } from '@playwright/test';

test('diagnostic: debug actual mouse events', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "456"
  await page.keyboard.type('456');
  await page.waitForTimeout(300);

  // Inject logging into mouse event handlers
  const result = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const editor = app.editor;

    // Store original handlers
    const originalMouseDown = editor.handleMouseDown.bind(editor);
    const originalMouseMove = editor.handleMouseMove.bind(editor);

    const logs = {
      down: [],
      move: []
    };

    // Wrap handleMouseDown
    editor.handleMouseDown = function(event) {
      const rect = this.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const cellPos = this.calculateCellPosition(x, y);

      logs.down.push({
        clientX: event.clientX,
        clientY: event.clientY,
        rectLeft: rect.left,
        rectTop: rect.top,
        editorX: x,
        editorY: y,
        calculatedCellPos: cellPos
      });

      console.log(`[MOUSE DOWN] clientX=${event.clientX.toFixed(2)}, rect.left=${rect.left.toFixed(2)}, editorX=${x.toFixed(2)}, cellPos=${cellPos}`);
      return originalMouseDown(event);
    };

    // Wrap handleMouseMove
    editor.handleMouseMove = function(event) {
      if (!this.isDragging) return;

      const rect = this.element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const cellPos = this.calculateCellPosition(x, y);

      logs.move.push({
        clientX: event.clientX,
        clientY: event.clientY,
        rectLeft: rect.left,
        editorX: x,
        calculatedCellPos: cellPos,
        dragStartPos: this.dragStartPos
      });

      console.log(`[MOUSE MOVE] clientX=${event.clientX.toFixed(2)}, editorX=${x.toFixed(2)}, cellPos=${cellPos}, dragStart=${this.dragStartPos}`);
      return originalMouseMove(event);
    };

    // Store logs on window for later retrieval
    window.__mouseLogs = logs;

    return 'Handlers wrapped';
  });

  console.log('Result:', result);

  // Get cell positions
  const cellPositions = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('[data-cell-index]'));
    return cells.map(cell => {
      const rect = cell.getBoundingClientRect();
      return {
        index: parseInt(cell.getAttribute('data-cell-index')),
        text: cell.textContent,
        left: rect.left,
        right: rect.right
      };
    });
  });

  console.log('\n=== CELL POSITIONS ===');
  cellPositions.forEach(c => {
    console.log(`Cell ${c.index} "${c.text}": left=${c.left.toFixed(2)}, right=${c.right.toFixed(2)}`);
  });

  // Perform mouse drag from cell 1 to cell 2
  const cell1 = cellPositions.find(c => c.index === 1);
  const cell2 = cellPositions.find(c => c.index === 2);

  const startX = cell1.left + (cell1.right - cell1.left) / 2;
  const startY = 114.50;  // Some Y value
  const endX = cell2.right - 5;
  const endY = 114.50;

  console.log(`\n=== PERFORMING DRAG ===`);
  console.log(`From: (${startX.toFixed(2)}, ${startY}) to (${endX.toFixed(2)}, ${endY})`);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 5 });
  await page.mouse.up();

  await page.waitForTimeout(300);

  // Get the logs
  const logs = await page.evaluate(() => window.__mouseLogs);
  console.log('\n=== MOUSE EVENT LOGS ===');
  console.log('DOWN events:', JSON.stringify(logs.down, null, 2));
  console.log('MOVE events:', JSON.stringify(logs.move, null, 2));

  // Get final selection
  const selection = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const sel = app.editor.getSelection();
    return {
      start: sel.start,
      end: sel.end,
      text: app.editor.getSelectedText()
    };
  });

  console.log('\n=== FINAL SELECTION ===');
  console.log(`Selection: start=${selection.start}, end=${selection.end}, text="${selection.text}"`);

  expect(selection.text).toBe('56');
});
