import { test } from '@playwright/test';

test('measure glyph widths: ASCII "1" vs PUA U+E100', async ({ page }) => {
  await page.goto('http://localhost:8080');

  // Wait for editor to be ready
  await page.waitForSelector('#editor-root', { state: 'visible' });

  // Measure widths using canvas
  const measurements = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '32px NotationFont';

    // Measure ASCII "1"
    const ascii1Width = ctx.measureText('1').width;

    // Measure PUA U+E100 (what we use for "1" in Number system)
    const pua1 = String.fromCodePoint(0xE100);
    const pua1Width = ctx.measureText(pua1).width;

    // Also measure in the actual editor font settings
    const editorRoot = document.getElementById('editor-root');
    const computedStyle = window.getComputedStyle(editorRoot);
    const editorFont = computedStyle.fontFamily;
    const editorFontSize = computedStyle.fontSize;

    ctx.font = `${editorFontSize} ${editorFont}`;
    const pua1WidthEditor = ctx.measureText(pua1).width;
    const ascii1WidthEditor = ctx.measureText('1').width;

    return {
      ascii1Width,
      pua1Width,
      pua1WidthEditor,
      ascii1WidthEditor,
      editorFont,
      editorFontSize,
      ratio: pua1Width / ascii1Width
    };
  });

  console.log('=== Glyph Width Measurements ===');
  console.log(`Editor font: ${measurements.editorFont}`);
  console.log(`Editor font size: ${measurements.editorFontSize}`);
  console.log(`ASCII "1" width (32px NotationFont): ${measurements.ascii1Width}px`);
  console.log(`PUA U+E100 width (32px NotationFont): ${measurements.pua1Width}px`);
  console.log(`ASCII "1" width (editor settings): ${measurements.ascii1WidthEditor}px`);
  console.log(`PUA U+E100 width (editor settings): ${measurements.pua1WidthEditor}px`);
  console.log(`Ratio (PUA/ASCII): ${measurements.ratio}`);
  console.log('================================');
});
