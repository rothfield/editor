import { test, expect } from '@playwright/test';

test('diagnostic: cursor position to stop index mapping', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type "Hello"
  await page.keyboard.type('Hello');
  await page.waitForTimeout(300);

  // Get current state
  const beforeArrow = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const stops = app.editor.getNavigableStops();

    return {
      cursorPos: app.editor.charPos,
      stopCount: stops.length,
      stops: stops.map(s => ({
        stopIndex: s.stopIndex,
        cellIndex: s.cellIndex,
        x: s.x
      })),
      currentStopIndex: app.editor.currentStopIndex
    };
  });

  console.log('\n=== BEFORE ArrowLeft ===');
  console.log(`Cursor position (charPos): ${beforeArrow.cursorPos}`);
  console.log(`Current stop index: ${beforeArrow.currentStopIndex}`);
  console.log(`Total stops: ${beforeArrow.stopCount}`);
  console.log('Stops:');
  beforeArrow.stops.forEach(s => {
    console.log(`  [${s.stopIndex}] cellIndex=${s.cellIndex} x=${s.x}`);
  });

  // Press ArrowLeft
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);

  // Get state after arrow
  const afterArrow = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    const stops = app.editor.getNavigableStops();

    return {
      cursorPos: app.editor.charPos,
      currentStopIndex: app.editor.currentStopIndex,
      stopCount: stops.length
    };
  });

  console.log('\n=== AFTER ArrowLeft ===');
  console.log(`Cursor position (charPos): ${afterArrow.cursorPos}`);
  console.log(`Current stop index: ${afterArrow.currentStopIndex}`);

  // Type X
  await page.keyboard.type('X');

  // Check final document
  const doc = await page.evaluate(() => {
    const app = window.MusicNotationApp.app();
    return app.editor.theDocument.lines[0].cells.map(c => c.char).join('');
  });

  console.log('\n=== FINAL RESULT ===');
  console.log(`Document: "${doc}"`);
  console.log(`Expected: "HellXo"`);
  console.log(`Match: ${doc === 'HellXo'}`);

  // Detailed analysis
  console.log('\n=== ANALYSIS ===');
  console.log(`Started at charPos ${beforeArrow.cursorPos} (stopIndex ${beforeArrow.currentStopIndex})`);
  console.log(`After ArrowLeft: charPos ${afterArrow.cursorPos} (stopIndex ${afterArrow.currentStopIndex})`);
  console.log(`Moved from stopIndex ${beforeArrow.currentStopIndex} to ${afterArrow.currentStopIndex}`);
  console.log(`This corresponds to cellIndex ${beforeArrow.stops[afterArrow.currentStopIndex]?.cellIndex}`);
});
