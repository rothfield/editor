import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor, waitForEditorReady } from '../utils/editor.helpers';

/**
 * Generic diagnostic tool for debugging input issues
 *
 * Usage:
 *   CHARS=":| " npx playwright test tests/e2e-pw/tests/diagnose-input.spec.js
 *   CHARS="1 2 3" npx playwright test tests/e2e-pw/tests/diagnose-input.spec.js
 */

test.describe('Diagnostic: Input Sequence Analysis', () => {
  test('diagnose character sequence', async ({ editorPage: page }) => {
    // Get characters from environment variable
    const charsToType = process.env.CHARS || ':| ';

    console.log(`\n${'='.repeat(80)}`);
    console.log(`DIAGNOSING INPUT: "${charsToType}"`);
    console.log(`${'='.repeat(80)}\n`);

    // Wait for editor to be ready
    await waitForEditorReady(page);
    await page.waitForTimeout(100);

    // Set up console message capture
    const consoleLogs = [];
    page.on('console', (msg) => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      });
    });

    // Type the characters
    console.log(`\n→ Typing: ${JSON.stringify(charsToType)}`);
    await typeInEditor(page, charsToType);
    await page.waitForTimeout(200);

    // Extract comprehensive diagnostic information
    const diagnostics = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      if (!app) {
        return { error: 'App not initialized' };
      }

      const editor = app.editor;
      const doc = editor?.theDocument || editor?.document;

      // Helper: Get text content of a tab by ID
      const getTabContent = (tabId) => {
        const tabPanel = document.querySelector(`[data-tab-content="${tabId}"]`);
        if (!tabPanel) return null;

        const preElement = tabPanel.querySelector('pre');
        if (preElement) return preElement.textContent;

        return tabPanel.textContent;
      };

      // Get all cell data from first line
      const line = doc?.lines?.[0];
      const cellsData = line?.cells?.map((cell, idx) => ({
        index: idx,
        char: cell.char,
        kind: cell.kind?.name || cell.kind,
        continuation: cell.continuation,
        col: cell.col,
        octave: cell.octave,
        slur_indicator: cell.slur_indicator?.name || cell.slur_indicator
      })) || [];

      // Get DOM structure for the first line (using multiple selectors)
      let notationLine = document.querySelector('[data-line-index="0"]');
      if (!notationLine) {
        notationLine = document.querySelector('[data-line="0"]');
      }
      if (!notationLine) {
        notationLine = document.querySelector('.notation-line');
      }

      // Also get the editor element to check structure
      const editorElement = document.getElementById('notation-editor');
      const editorHTML = editorElement?.innerHTML.substring(0, 300) || 'not found';

      const domCells = notationLine ? Array.from(notationLine.querySelectorAll('[data-cell-index], .char-cell, [class*="kind-"]')).map((el, idx) => ({
        index: idx,
        innerHTML: el.innerHTML.substring(0, 200),
        className: el.className,
        textContent: el.textContent,
        dataAttributes: {
          cellIndex: el.dataset.cellIndex,
          continuation: el.dataset.continuation,
          glyphLength: el.dataset.glyphLength,
          octave: el.dataset.octave
        }
      })) : [];

      // Get computed styles for barline cells to check for SMuFL glyphs
      const barlineCells = notationLine ? Array.from(notationLine.querySelectorAll('.kind-barline')).map((el, idx) => {
        const computed = window.getComputedStyle(el);
        const afterComputed = window.getComputedStyle(el, '::after');
        return {
          index: idx,
          char: el.textContent,
          className: el.className,
          content: computed.content || 'none',
          afterContent: afterComputed.content || 'none',
          color: computed.color,
          fontFamily: computed.fontFamily
        };
      }) : [];

      return {
        lineData: {
          cellCount: line?.cells?.length || 0,
          content: line?.cells?.map(c => c.char).join('') || '',
          cells: cellsData
        },
        domStructure: {
          editorHTML: editorHTML,
          notationLineExists: !!notationLine,
          notationLineClass: notationLine?.className || 'not found',
          cellCount: domCells.length,
          cells: domCells,
          barlineCells: barlineCells
        },
        tabData: {
          layout: getTabContent('layout'),
          model: getTabContent('model'),
          lilypond: getTabContent('lilypond'),
          musicxml: getTabContent('musicxml')
        }
      };
    });

    // Print diagnostics
    console.log('\n📊 CELL DATA (from Document.lines[0])');
    console.log('─'.repeat(80));
    if (diagnostics.lineData?.cells) {
      console.table(diagnostics.lineData.cells);
    }

    console.log('\n🎨 DOM STRUCTURE');
    console.log('─'.repeat(80));
    console.log(`Notation line exists: ${diagnostics.domStructure?.notationLineExists}`);
    console.log(`Notation line class: ${diagnostics.domStructure?.notationLineClass}`);
    console.log(`Editor HTML (first 300 chars):\n${diagnostics.domStructure?.editorHTML}\n`);
    console.log(`Total rendered cells: ${diagnostics.domStructure?.cellCount}`);

    if (diagnostics.domStructure?.cells) {
      diagnostics.domStructure.cells.forEach((cell, idx) => {
        console.log(`\nCell ${idx}:`);
        console.log(`  className: ${cell.className}`);
        console.log(`  textContent: ${cell.textContent}`);
        console.log(`  innerHTML (first 100 chars): ${cell.innerHTML.substring(0, 100)}`);
        console.log(`  data-continuation: ${cell.dataAttributes.continuation}`);
        console.log(`  data-glyphLength: ${cell.dataAttributes.glyphLength}`);
      });
    }

    console.log('\n🎵 BARLINE RENDERING (SMuFL Glyphs)');
    console.log('─'.repeat(80));
    if (diagnostics.domStructure?.barlineCells?.length > 0) {
      diagnostics.domStructure.barlineCells.forEach((cell, idx) => {
        console.log(`\nBarline Cell ${idx}:`);
        console.log(`  char: "${cell.char}"`);
        console.log(`  className: ${cell.className}`);
        console.log(`  computed content: ${cell.content}`);
        console.log(`  ::after content: ${cell.afterContent}`);
        console.log(`  font-family: ${cell.fontFamily}`);
      });
    } else {
      console.log('No barline cells found');
    }

    console.log('\n📋 TAB DATA');
    console.log('─'.repeat(80));

    if (diagnostics.tabData?.layout) {
      console.log('\n▶️  LAYOUT TAB:');
      console.log(diagnostics.tabData.layout.substring(0, 500));
    }

    if (diagnostics.tabData?.model) {
      console.log('\n▶️  PERSISTENT MODEL TAB:');
      console.log(diagnostics.tabData.model.substring(0, 500));
    }

    if (diagnostics.tabData?.lilypond) {
      console.log('\n▶️  LILYPOND SRC TAB:');
      console.log(diagnostics.tabData.lilypond.substring(0, 500));
    }

    if (diagnostics.tabData?.musicxml) {
      console.log('\n▶️  MUSICXML TAB:');
      console.log(diagnostics.tabData.musicxml.substring(0, 500));
    }

    console.log('\n💬 CONSOLE LOGS');
    console.log('─'.repeat(80));
    consoleLogs.forEach((log) => {
      console.log(`[${log.type}] ${log.text}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('END DIAGNOSTIC');
    console.log('='.repeat(80) + '\n');

    // Assert that we got some cells
    expect(diagnostics.lineData?.cellCount).toBeGreaterThan(0);
  });
});
