import { test, expect } from '../fixtures/editor.fixture';
import { typeInEditor } from '../utils/editor.helpers';

test.describe('Textarea Rendering Mode', () => {
  test('default mode uses textarea rendering', async ({ editorPage: page }) => {
    // editorPage fixture already clicked and focused the textarea

    // Should have notation-textarea (textarea is now the only rendering mode)
    const textareas = await page.locator('.notation-textarea').count();
    console.log('Found ' + textareas + ' notation-textarea elements');
    expect(textareas).toBeGreaterThan(0);

    // Should NOT have char-cells (legacy cell mode removed)
    const cells = await page.locator('.char-cell').count();
    expect(cells).toBe(0);
  });

  // NOTE: Legacy cell mode has been removed. Textarea is now the only rendering mode.

  test('typing in textarea mode updates document model', async ({ editorPage: page }) => {
    // Collect console logs to debug
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    // Textarea mode is now the default - no URL param needed

    // Get textarea and verify it's there
    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();

    // Check initial state
    const initialState = await page.evaluate(() => {
      const ta = document.querySelector('.notation-textarea');
      return {
        exists: !!ta,
        focused: document.activeElement === ta,
        activeElementTag: document.activeElement?.tagName,
        activeElementClass: document.activeElement?.className,
        textareaValue: ta?.value || ''
      };
    });
    console.log('Initial state:', initialState);

    // Click and verify focus
    await textarea.click();
    await page.waitForTimeout(100);

    const afterClickState = await page.evaluate(() => {
      const ta = document.querySelector('.notation-textarea');
      return {
        focused: document.activeElement === ta,
        activeElementTag: document.activeElement?.tagName,
        activeElementClass: document.activeElement?.className
      };
    });
    console.log('After click state:', afterClickState);

    // Try using fill() which is more reliable for textareas
    await textarea.fill('1 2 3');
    await page.waitForTimeout(500);

    // Log what we captured
    const textareaLogs = logs.filter(l => l.includes('[TextareaRenderer]'));
    console.log('TextareaRenderer logs:', textareaLogs);

    // Check what's actually in the textarea
    const textareaValue = await textarea.inputValue();
    console.log('Textarea value:', textareaValue);

    // Check that WASM document model was updated (using getDocumentSnapshot)
    const docContent = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      const wasmModule = app?.editor?.wasmModule;
      if (wasmModule?.getDocumentSnapshot) {
        try {
          const doc = wasmModule.getDocumentSnapshot();
          const cells = doc?.lines?.[0]?.cells || [];
          // Get cell kinds and any with pitch_code (pitched elements)
          const pitchedCells = cells.filter(c => c.pitch_code !== null && c.pitch_code !== undefined);
          return {
            cellCount: cells.length,
            pitchedCellCount: pitchedCells.length,
            cellKinds: cells.map(c => c.kind),
            pitchCodes: pitchedCells.map(c => c.pitch_code),
            hasCells: cells.length > 0,
            hasPitchedCells: pitchedCells.length > 0
          };
        } catch (e) {
          return { error: e.message, cellCount: 0, pitchedCellCount: 0, cellKinds: [], pitchCodes: [], hasCells: false, hasPitchedCells: false };
        }
      }
      return { error: 'No wasmModule', cellCount: 0, pitchedCellCount: 0, cellKinds: [], pitchCodes: [], hasCells: false, hasPitchedCells: false };
    });

    console.log('WASM document model after typing in textarea:', docContent);

    // Document should have cells: "1 2 3" = 5 cells (3 pitches + 2 spaces)
    expect(docContent.hasCells).toBe(true);
    expect(docContent.cellCount).toBe(5);
    // Should have 3 pitched cells (for 1, 2, 3)
    expect(docContent.hasPitchedCells).toBe(true);
    expect(docContent.pitchedCellCount).toBe(3);
  });
});
