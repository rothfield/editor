import { test, expect } from '@playwright/test';
import { openTab, readPaneText } from '../helpers/inspectors.js';

/**
 * Debug test for superscript overline issue
 * User reports: Type "4", make superscript -> shows overline when it shouldn't
 */
test('debug superscript overline', async ({ page }) => {
  await page.goto('/');
  const editor = page.locator('#notation-editor');
  await expect(editor).toBeVisible();

  // Clear and type "4"
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  await page.keyboard.type('4');
  await page.waitForTimeout(100);

  // Select all and make superscript
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Alt+O');
  await page.waitForTimeout(500);

  // Get the textarea element and its computed styles
  const textarea = page.locator('.notation-textarea').first();

  const styles = await textarea.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      textDecoration: cs.textDecoration,
      textDecorationLine: cs.textDecorationLine,
      textDecorationStyle: cs.textDecorationStyle,
      textDecorationColor: cs.textDecorationColor,
      border: cs.border,
      borderTop: cs.borderTop,
      outline: cs.outline,
      boxShadow: cs.boxShadow,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
    };
  });

  console.log('=== Computed Styles ===');
  console.log(JSON.stringify(styles, null, 2));

  // Get the actual text content and codepoints
  const textContent = await textarea.inputValue();
  console.log('=== Text Content ===');
  console.log('Value:', textContent);
  console.log('String length:', textContent.length);
  console.log('Codepoints (spread):', [...textContent].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(5, '0')).join(' '));
  console.log('Char codes (raw):', Array.from(textContent).map((c, i) => `[${i}] U+${textContent.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`).join(' '));

  // Check DocModel
  await openTab(page, 'tab-docmodel');
  const docModel = await readPaneText(page, 'pane-docmodel');

  // Extract underline/overline from docmodel
  const underlineMatch = docModel.match(/underline:\s*"([^"]+)"/);
  const overlineMatch = docModel.match(/overline:\s*"([^"]+)"/);

  console.log('=== DocModel Line Variants ===');
  console.log('underline:', underlineMatch ? underlineMatch[1] : 'not found');
  console.log('overline:', overlineMatch ? overlineMatch[1] : 'not found');

  // Take a zoomed screenshot of just the textarea area
  const textareaBox = await textarea.boundingBox();
  if (textareaBox) {
    await page.screenshot({
      path: 'artifacts/superscript-overline-debug.png',
      clip: {
        x: Math.max(0, textareaBox.x - 20),
        y: Math.max(0, textareaBox.y - 20),
        width: Math.min(200, textareaBox.width + 40),
        height: Math.min(100, textareaBox.height + 40)
      }
    });
  }

  // Take full page screenshot too
  await page.screenshot({ path: 'artifacts/superscript-overline-full.png' });

  // Now toggle Notation Font ON (Ctrl+Alt+N) and capture again
  await page.keyboard.press('Control+Alt+N');
  await page.waitForTimeout(300);

  // Verify font is ON
  const fontStatus = await page.locator('#notation-font-test-status').textContent();
  console.log('=== Font Status ===');
  console.log(fontStatus);

  // Screenshot with font ON
  await page.screenshot({ path: 'artifacts/superscript-overline-font-on.png' });

  // Get computed font-family now
  const fontOnStyles = await textarea.evaluate(el => {
    const cs = window.getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
    };
  });
  console.log('=== Font ON Styles ===');
  console.log(JSON.stringify(fontOnStyles, null, 2));

  // Check if font is actually rendering the glyph (not showing tofu)
  // By measuring the rendered width of the character
  const glyphMetrics = await textarea.evaluate(el => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const style = window.getComputedStyle(el);
    ctx.font = `${style.fontSize} ${style.fontFamily}`;

    const text = el.value;
    const width = ctx.measureText(text).width;
    const charCode = text.codePointAt(0);

    // Also try measuring with just NotationFont
    ctx.font = `${style.fontSize} NotationFont`;
    const notationWidth = ctx.measureText(text).width;

    return {
      charCode: charCode,
      charCodeHex: 'U+' + charCode.toString(16).toUpperCase().padStart(5, '0'),
      computedWidth: width,
      notationFontWidth: notationWidth,
      textLength: text.length,
    };
  });

  console.log('=== Glyph Metrics ===');
  console.log(JSON.stringify(glyphMetrics, null, 2));

  // Direct canvas rendering test
  const canvasTest = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');

    // Draw the superscript character using NotationFont
    ctx.font = '32px NotationFont';
    const char = String.fromCodePoint(0xF8BA0);
    ctx.fillText(char, 10, 50);

    // Get image data to check if something was rendered
    const imageData = ctx.getImageData(0, 0, 100, 100);
    let nonEmptyPixels = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) nonEmptyPixels++;
    }

    // Also test with regular '4'
    ctx.clearRect(0, 0, 100, 100);
    ctx.fillText('4', 10, 50);
    const imageData2 = ctx.getImageData(0, 0, 100, 100);
    let ascii4Pixels = 0;
    for (let i = 3; i < imageData2.data.length; i += 4) {
      if (imageData2.data[i] > 0) ascii4Pixels++;
    }

    return {
      superscriptPixels: nonEmptyPixels,
      ascii4Pixels: ascii4Pixels,
      ratio: nonEmptyPixels / ascii4Pixels,
      charLength: char.length
    };
  });

  console.log('=== Canvas Render Test ===');
  console.log(JSON.stringify(canvasTest, null, 2));

  // Assertions
  expect(underlineMatch ? underlineMatch[1] : '').toBe('None');
  expect(overlineMatch ? overlineMatch[1] : '').toBe('None');
});
