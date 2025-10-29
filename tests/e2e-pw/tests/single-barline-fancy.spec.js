import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Single Barline Fancy Rendering', () => {
  test('single barline should have SMuFL glyph styling like other barlines', async ({ editorPage: page }) => {
    // Type a barline to create one
    await typeInEditor(page, 'S |');

    // Get the barline cell element and check its styling
    const barlineInfo = await page.evaluate(() => {
      // Find all barline cells
      const barlineCells = document.querySelectorAll('.char-cell.kind-barline');

      if (barlineCells.length === 0) {
        return { error: 'No barline cells found' };
      }

      // Get the last one (should be the single barline)
      const barlineCell = barlineCells[barlineCells.length - 1];

      // Check for the "single-bar" class
      const hasClass = barlineCell.classList.contains('single-bar');

      // Get computed styles
      const computed = window.getComputedStyle(barlineCell);
      const color = computed.color;
      const fontSize = computed.fontSize;

      // Check for ::after pseudo-element content (SMuFL glyph)
      const afterContent = window.getComputedStyle(barlineCell, '::after').content;

      // Get the text content (should be "|" if no glyph applied)
      const textContent = barlineCell.textContent;

      return {
        hasClass,
        classList: Array.from(barlineCell.classList),
        color,
        fontSize,
        afterContent,
        textContent,
        computedColorIsTransparent: color === 'rgba(0, 0, 0, 0)' || color === 'transparent'
      };
    });

    if (barlineInfo.error) {
      throw new Error(barlineInfo.error);
    }

    console.log('Single Barline Styling:');
    console.log(`  Has single-bar class: ${barlineInfo.hasClass}`);
    console.log(`  All classes: ${barlineInfo.classList.join(', ')}`);
    console.log(`  Computed color: ${barlineInfo.color}`);
    console.log(`  Is transparent: ${barlineInfo.computedColorIsTransparent}`);
    console.log(`  ::after content: ${barlineInfo.afterContent}`);
    console.log(`  Text content: "${barlineInfo.textContent}"`);

    // Single barline should have the single-bar class
    expect(barlineInfo.hasClass).toBe(true);

    // Single barline should be transparent (hiding ASCII "|")
    expect(barlineInfo.computedColorIsTransparent).toBe(true);

    // Single barline should have SMuFL glyph in ::after
    expect(barlineInfo.afterContent).not.toBe('none');
    expect(barlineInfo.afterContent).not.toBe('""');
  });

  test('single barline should have fancy styling distinct from multi-char barline continuations', async ({ editorPage: page }) => {
    // Type different barline types including a single barline
    await typeInEditor(page, 'S | |: :| ||');

    // Get all barline cells and compare their styling
    const barlineComparison = await page.evaluate(() => {
      const barlineCells = document.querySelectorAll('.char-cell.kind-barline');
      const results = [];

      barlineCells.forEach((cell, idx) => {
        const computed = window.getComputedStyle(cell);
        const afterComputed = window.getComputedStyle(cell, '::after');
        const isContinuation = cell.dataset.continuation === 'true';

        results.push({
          index: idx,
          classes: Array.from(cell.classList),
          computedColor: computed.color,
          isTransparent: computed.color === 'rgba(0, 0, 0, 0)' || computed.color === 'transparent',
          afterContent: afterComputed.content,
          hasAfterContent: afterComputed.content !== 'none' && afterComputed.content !== '""',
          isContinuation,
          hasFancyClass: cell.classList.contains('single-bar') ||
                        cell.classList.contains('repeat-left-start') ||
                        cell.classList.contains('repeat-right-start') ||
                        cell.classList.contains('double-bar-start')
        });
      });

      return results;
    });

    console.log('All Barline Types Comparison:');
    barlineComparison.forEach((info) => {
      console.log(`  Barline ${info.index}:`);
      console.log(`    Classes: ${info.classes.join(', ')}`);
      console.log(`    Continuation: ${info.isContinuation}`);
      console.log(`    Has fancy class: ${info.hasFancyClass}`);
      console.log(`    Transparent: ${info.isTransparent}`);
      console.log(`    Has ::after content: ${info.hasAfterContent}`);
    });

    // Single barlines (not continuations) should have fancy styling class
    const singleBarlines = barlineComparison.filter(info => !info.isContinuation);
    singleBarlines.forEach((info, idx) => {
      expect(info.hasFancyClass).toBe(true,
        `Non-continuation barline ${info.index} should have fancy styling class`);
      expect(info.isTransparent).toBe(true,
        `Barline ${info.index} should be transparent (hiding ASCII char)`);
      expect(info.hasAfterContent).toBe(true,
        `Barline ${info.index} should have ::after SMuFL glyph`);
    });

    // Continuation cells should be transparent but may not have special classes
    const continuationCells = barlineComparison.filter(info => info.isContinuation);
    continuationCells.forEach((info) => {
      expect(info.isTransparent).toBe(true,
        `Continuation cell ${info.index} should be transparent (hidden)`);
    });

    // Find the first single barline (should have single-bar class)
    const firstSingleBarline = barlineComparison.find(info =>
      info.classes.includes('single-bar')
    );

    expect(firstSingleBarline).toBeDefined();
    expect(firstSingleBarline.hasFancyClass).toBe(true);
    expect(firstSingleBarline.hasAfterContent).toBe(true);
  });

  test('single barline should be visually distinct from ASCII pipe character', async ({ editorPage: page }) => {
    // Type a single barline
    await typeInEditor(page, 'A |');

    // Compare visual rendering: the barline should show the SMuFL glyph, not ASCII "|"
    const visualTest = await page.evaluate(() => {
      const barlineCell = document.querySelector('.char-cell.single-bar');

      if (!barlineCell) {
        return { error: 'Single barline cell not found' };
      }

      const computed = window.getComputedStyle(barlineCell);
      const afterComputed = window.getComputedStyle(barlineCell, '::after');

      // The cell text content (the "|") should be hidden
      const textIsHidden = computed.color === 'rgba(0, 0, 0, 0)' || computed.color === 'transparent';

      // The glyph should be visible via ::after
      const glyphIsShown = afterComputed.content !== 'none' && afterComputed.content !== '""';

      return {
        textContent: barlineCell.textContent,
        textIsHidden,
        glyphIsShown,
        computedColor: computed.color,
        fontFamily: computed.fontFamily,
        afterFontFamily: afterComputed.fontFamily,
        isBravuraFont: afterComputed.fontFamily.includes('Bravura')
      };
    });

    if (visualTest.error) {
      throw new Error(visualTest.error);
    }

    console.log('Single Barline Visual Rendering:');
    console.log(`  Text content: "${visualTest.textContent}"`);
    console.log(`  Text hidden: ${visualTest.textIsHidden}`);
    console.log(`  Glyph shown: ${visualTest.glyphIsShown}`);
    console.log(`  Computed color: ${visualTest.computedColor}`);
    console.log(`  ::after font: ${visualTest.afterFontFamily}`);
    console.log(`  Uses Bravura: ${visualTest.isBravuraFont}`);

    // Text ("|") should be hidden
    expect(visualTest.textIsHidden).toBe(true);

    // SMuFL glyph should be shown
    expect(visualTest.glyphIsShown).toBe(true);

    // Glyph should use Bravura font
    expect(visualTest.isBravuraFont).toBe(true);
  });
});
