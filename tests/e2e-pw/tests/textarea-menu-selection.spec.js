import { test, expect } from '@playwright/test';

test.describe('Textarea selection preservation', () => {
  test('textarea should keep focus when clicking menu button', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();

    // Type some content
    await textarea.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(200);

    // Select some text
    await textarea.evaluate(el => {
      el.setSelectionRange(2, 5);
    });

    // Verify selection exists
    const selectionBefore = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd
    }));
    expect(selectionBefore.end - selectionBefore.start).toBeGreaterThan(0);

    // Click on menu button - should NOT steal focus
    const fileMenu = page.locator('text=File').first();
    await expect(fileMenu).toBeVisible();
    await fileMenu.click();
    await page.waitForTimeout(100);

    // Textarea should still have focus (menu buttons prevent focus loss)
    const textareaStillFocused = await textarea.evaluate(el => document.activeElement === el);
    console.log('Textarea still focused after menu click:', textareaStillFocused);
    expect(textareaStillFocused).toBe(true);

    // Selection should be preserved
    const selectionAfter = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd
    }));
    console.log('Selection after menu click:', selectionAfter);
    expect(selectionAfter.start).toBe(selectionBefore.start);
    expect(selectionAfter.end).toBe(selectionBefore.end);
  });

  test('selection should be preserved when clicking toolbar button', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('.notation-textarea').first();
    await expect(textarea).toBeVisible();

    // Type some content
    await textarea.click();
    await page.keyboard.type('1 2 3');
    await page.waitForTimeout(200);

    // Select all text
    await textarea.evaluate(el => {
      el.setSelectionRange(0, el.value.length);
    });

    const selectionBefore = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd
    }));
    console.log('Selection before toolbar click:', selectionBefore);

    // Click on any toolbar/header element (not the textarea)
    const header = page.locator('header').first();
    if (await header.isVisible()) {
      await header.click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(100);
    }

    // Check if selection is preserved
    const selectionAfter = await textarea.evaluate(el => ({
      start: el.selectionStart,
      end: el.selectionEnd
    }));
    console.log('Selection after toolbar click:', selectionAfter);

    // Selection should be preserved
    expect(selectionAfter.start).toBe(selectionBefore.start);
    expect(selectionAfter.end).toBe(selectionBefore.end);
  });
});
