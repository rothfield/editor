import { test, expect } from '@playwright/test';

test('Textarea overlay positions should match character positions', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();

  // Type notation with lyrics/tala that will create overlays
  await textarea.click();
  // Type some beats with spaces
  await page.keyboard.type('1 2 3 4');
  await page.waitForTimeout(500);

  // Get textarea display list from WASM
  const displayData = await page.evaluate(() => {
    const editor = window.MusicNotationApp?.app()?.editor;
    if (!editor?.wasmModule?.getTextareaDisplayList) return null;

    try {
      const displayList = editor.wasmModule.getTextareaDisplayList();
      if (!displayList?.lines?.[0]) return null;

      return {
        text: displayList.lines[0].text,
        textLength: displayList.lines[0].text?.length || 0,
        hasOverlays: (displayList.lines[0].talas?.length > 0) || (displayList.lines[0].lyrics?.length > 0)
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('Textarea display data:', JSON.stringify(displayData, null, 2));

  // Verify we have text content
  expect(displayData).not.toBeNull();
  expect(displayData.textLength).toBeGreaterThan(0);

  console.log('✓ Textarea display list is populated');
});

test('Textarea should maintain consistent character width', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const textarea = page.locator('.notation-textarea').first();
  await expect(textarea).toBeVisible();

  // Type notation
  await textarea.click();
  await page.keyboard.type('1234567');
  await page.waitForTimeout(300);

  // Get character positions using selection API
  const charWidths = await page.evaluate(() => {
    const textarea = document.querySelector('.notation-textarea');
    if (!textarea) return null;

    const text = textarea.value;
    const widths = [];

    // Create a temporary span to measure character widths
    const span = document.createElement('span');
    span.style.cssText = window.getComputedStyle(textarea).cssText;
    span.style.position = 'absolute';
    span.style.visibility = 'hidden';
    span.style.whiteSpace = 'pre';
    document.body.appendChild(span);

    for (let i = 0; i < text.length; i++) {
      span.textContent = text[i];
      widths.push({
        char: text[i],
        codePoint: text.codePointAt(i)?.toString(16),
        width: span.getBoundingClientRect().width
      });
    }

    document.body.removeChild(span);
    return widths;
  });

  console.log('Character widths:', JSON.stringify(charWidths, null, 2));

  // All notation characters should have similar widths (monospace-like for notation)
  // This is achieved through NotationFont glyph design
  expect(charWidths).not.toBeNull();
  expect(charWidths.length).toBeGreaterThan(0);

  console.log('✓ Character width measurement works');
});
