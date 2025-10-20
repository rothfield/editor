import { test, expect } from '../fixtures/editor.fixture';
import {
  typeInEditor,
  pressReturn,
  moveCursor,
  clearEditor,
} from '../utils/editor.helpers';

test.describe('Console Error Monitoring', () => {
  test('should load editor without console errors', async ({ cleanPage: page }) => {
    const consoleErrors = [];
    const consoleWarnings = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('#notation-editor', { timeout: 10000 });
    await page.waitForFunction(
      () => typeof window.musicEditor !== 'undefined',
      { timeout: 10000 }
    );

    expect(consoleErrors).toEqual([]);
  });

  test('should handle text input without console errors', async ({ editorPage: page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await typeInEditor(page, '1234567');
    await page.waitForTimeout(200);

    expect(consoleErrors).toEqual([]);
  });

  test('should handle adjacent notation without console errors', async ({ editorPage: page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await typeInEditor(page, '1#2b3##4bb5');
    await page.waitForTimeout(200);

    expect(consoleErrors).toEqual([]);
  });

  test('should handle Return key without console errors', async ({ editorPage: page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await typeInEditor(page, '1234');
    await pressReturn(page);
    await typeInEditor(page, '5671');
    await page.waitForTimeout(200);

    expect(consoleErrors).toEqual([]);
  });

  test('should handle cursor movement without console errors', async ({ editorPage: page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await typeInEditor(page, '1234567');
    await moveCursor(page, 'left', 3);
    await moveCursor(page, 'right', 2);
    await moveCursor(page, 'up', 1);
    await page.waitForTimeout(200);

    expect(consoleErrors).toEqual([]);
  });

  test('should handle clearing content without console errors', async ({ editorPage: page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await typeInEditor(page, '1234567');
    await clearEditor(page);
    await page.waitForTimeout(200);

    expect(consoleErrors).toEqual([]);
  });

  test('should handle rapid input without console errors', async ({ editorPage: page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    const rapidNotation = '12345671234567'.repeat(5);
    await typeInEditor(page, rapidNotation, { delay: 0 });
    await page.waitForTimeout(500);

    expect(consoleErrors).toEqual([]);
  });

  test('should not have uncaught exceptions during normal use', async ({ editorPage: page }) => {
    const exceptions = [];

    page.on('pageerror', (error) => {
      exceptions.push(error.message);
    });

    await typeInEditor(page, '1#2b3');
    await pressReturn(page);
    await typeInEditor(page, '4##567');
    await moveCursor(page, 'left', 2);
    await typeInEditor(page, '1');
    await page.waitForTimeout(200);

    expect(exceptions).toEqual([]);
  });

  test('should not have failed network requests', async ({ editorPage: page }) => {
    const failedRequests = [];

    page.on('requestfailed', (request) => {
      failedRequests.push(request.url());
    });

    await typeInEditor(page, '1234567');
    await page.waitForTimeout(200);

    expect(failedRequests).toEqual([]);
  });

  test('should handle complex operations without console errors', async ({ editorPage: page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Complex sequence of operations
    await typeInEditor(page, '1#2b3');
    await pressReturn(page);
    await typeInEditor(page, '4##5 6b7');
    await moveCursor(page, 'left', 5);
    await typeInEditor(page, '1');
    await pressReturn(page);
    await typeInEditor(page, '2 3 4');
    await page.waitForTimeout(300);

    expect(consoleErrors).toEqual([]);
  });
});
