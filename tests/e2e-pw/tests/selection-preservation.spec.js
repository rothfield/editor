import { test, expect } from '@playwright/test';
import {
  waitForEditorReady,
  typeInEditor,
  getEditorState
} from '../utils/editor.helpers.js';

test.describe('Selection Preservation After Edit Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForEditorReady(page);
  });

  test('should preserve selection after applying slur (Alt+S)', async ({ page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(200);

    // Select range (col 0 to 5)
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 5 }
      );
      app.editor.render();
    });
    await page.waitForTimeout(100);

    // Verify selection is active
    const selectionBefore = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });

    expect(selectionBefore.is_empty).toBe(false);
    expect(selectionBefore.start.col).toBe(0);
    expect(selectionBefore.end.col).toBe(5);

    // Apply slur using Alt+S
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(300);

    // Verify selection is still active after operation
    const selectionAfter = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });

    expect(selectionAfter.is_empty).toBe(false);
    expect(selectionAfter.start.col).toBe(0);
    expect(selectionAfter.end.col).toBe(5);
  });

  test('should preserve selection after removing slur (Alt+Shift+S)', async ({ page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5');
    await page.waitForTimeout(200);

    // Apply slur first
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 5 }
      );
      app.editor.wasmModule.toggleSlur(0, 0, 5);
      app.editor.render();
    });
    await page.waitForTimeout(200);

    // Set selection again
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 5 }
      );
      app.editor.render();
    });
    await page.waitForTimeout(100);

    // Remove slur using Alt+Shift+S
    await page.keyboard.press('Alt+Shift+s');
    await page.waitForTimeout(300);

    // Verify selection is still active
    const selectionAfter = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });

    expect(selectionAfter.is_empty).toBe(false);
    expect(selectionAfter.start.col).toBe(0);
    expect(selectionAfter.end.col).toBe(5);
  });

  test('should preserve selection after increasing octave (Alt+U)', async ({ page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4');
    await page.waitForTimeout(200);

    // Select range
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 4 }
      );
      app.editor.render();
    });
    await page.waitForTimeout(100);

    // Apply upper octave using Alt+U
    await page.keyboard.press('Alt+u');
    await page.waitForTimeout(300);

    // Verify selection is still active
    const selectionAfter = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });

    expect(selectionAfter.is_empty).toBe(false);
    expect(selectionAfter.start.col).toBe(0);
    expect(selectionAfter.end.col).toBe(4);
  });

  test('should preserve selection after middle octave (Alt+M)', async ({ page }) => {
    // Type content with upper octave
    await typeInEditor(page, '1 2 3');
    await page.waitForTimeout(200);

    // Apply upper octave first
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 3 }
      );
      app.editor.wasmModule.shiftOctave(0, 0, 3, 1);
      app.editor.render();
    });
    await page.waitForTimeout(200);

    // Select again and reset to middle
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 3 }
      );
      app.editor.render();
    });
    await page.waitForTimeout(100);

    // Apply middle octave using Alt+M
    await page.keyboard.press('Alt+m');
    await page.waitForTimeout(300);

    // Verify selection is still active
    const selectionAfter = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });

    expect(selectionAfter.is_empty).toBe(false);
    expect(selectionAfter.start.col).toBe(0);
    expect(selectionAfter.end.col).toBe(3);
  });

  test('should preserve selection after decreasing octave (Alt+L)', async ({ page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4');
    await page.waitForTimeout(200);

    // Select range
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 4 }
      );
      app.editor.render();
    });
    await page.waitForTimeout(100);

    // Apply lower octave using Alt+L
    await page.keyboard.press('Alt+l');
    await page.waitForTimeout(300);

    // Verify selection is still active
    const selectionAfter = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });

    expect(selectionAfter.is_empty).toBe(false);
    expect(selectionAfter.start.col).toBe(0);
    expect(selectionAfter.end.col).toBe(4);
  });

  test('should preserve selection across multiple operations', async ({ page }) => {
    // Type content
    await typeInEditor(page, '1 2 3 4 5 6');
    await page.waitForTimeout(200);

    // Select range
    await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      app.editor.wasmModule.setSelection(
        { line: 0, col: 0 },
        { line: 0, col: 6 }
      );
      app.editor.render();
    });
    await page.waitForTimeout(100);

    // Apply slur
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(200);

    // Verify selection preserved
    let selection = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });
    expect(selection.is_empty).toBe(false);

    // Apply octave shift
    await page.keyboard.press('Alt+u');
    await page.waitForTimeout(200);

    // Verify selection still preserved
    selection = await page.evaluate(() => {
      const app = window.MusicNotationApp?.app();
      return app.editor.wasmModule.getSelectionInfo();
    });
    expect(selection.is_empty).toBe(false);
    expect(selection.start.col).toBe(0);
    expect(selection.end.col).toBe(6);
  });
});
