import { test, expect } from '@playwright/test';

test.describe('Arrow keys collapse selection like standard text editors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('Left arrow collapses selection to start position', async ({ page }) => {
    // Type some text: "S r g m"
    await page.keyboard.type('S r g m');

    // Go to end
    await page.keyboard.press('End');

    // Select the last character "m" by pressing Shift+ArrowLeft
    await page.keyboard.press('Shift+ArrowLeft');

    // Press left arrow (without shift) - should collapse to START of selection (before "m")
    await page.keyboard.press('ArrowLeft');

    // Type X - it should appear BEFORE "m"
    await page.keyboard.type('X');

    // Now check the document model (after all keyboard input is done)
    await page.getByTestId('tab-docmodel').click();
    const docmodel = page.getByTestId('pane-docmodel');
    await expect(docmodel).toBeVisible();
    const content = await docmodel.innerText();

    // X should appear before "m" - text should be "S r g Xm"
    expect(content).toContain('char: "X"');
    expect(content).toContain('char: "m"');

    // Verify X comes before m by checking column numbers
    const xMatch = content.match(/char: "X"[\s\S]*?col: (\d+)/);
    const mMatch = content.match(/char: "m"[\s\S]*?col: (\d+)/);

    expect(xMatch).toBeTruthy();
    expect(mMatch).toBeTruthy();
    expect(parseInt(xMatch[1])).toBeLessThan(parseInt(mMatch[1]));
  });

  test('Right arrow collapses selection to end position', async ({ page }) => {
    // Type some text: "S r g m"
    await page.keyboard.type('S r g m');

    // Go to start
    await page.keyboard.press('Home');

    // Select the first character "S" by pressing Shift+ArrowRight
    await page.keyboard.press('Shift+ArrowRight');

    // Press right arrow (without shift) - should collapse to END of selection (after "S")
    await page.keyboard.press('ArrowRight');

    // Type X - it should appear AFTER "S"
    await page.keyboard.type('X');

    // Now check the document model
    await page.getByTestId('tab-docmodel').click();
    const docmodel = page.getByTestId('pane-docmodel');
    await expect(docmodel).toBeVisible();
    const content = await docmodel.innerText();

    // X should appear after "S" - text should be "SX r g m"
    expect(content).toContain('char: "S"');
    expect(content).toContain('char: "X"');

    // Verify X comes after S by checking column numbers
    const sMatch = content.match(/char: "S"[\s\S]*?col: (\d+)/);
    const xMatch = content.match(/char: "X"[\s\S]*?col: (\d+)/);

    expect(sMatch).toBeTruthy();
    expect(xMatch).toBeTruthy();
    expect(parseInt(sMatch[1])).toBeLessThan(parseInt(xMatch[1]));
  });

  test('Down arrow collapses selection then moves down', async ({ page }) => {
    // Create two lines
    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');
    await page.keyboard.type('P d n s');

    // Go back to first line
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Home');

    // Select first two characters
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    // Press down arrow - should collapse selection and move down
    await page.keyboard.press('ArrowDown');

    // Type X - should appear on second line
    await page.keyboard.type('X');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docmodel = page.getByTestId('pane-docmodel');
    await expect(docmodel).toBeVisible();
    const content = await docmodel.innerText();

    // Should have X in the document
    expect(content).toContain('char: "X"');

    // Check that we have two lines (two entries in "lines" array)
    expect(content).toMatch(/lines:[\s\S]*-[\s\S]*-/);
  });

  test('Up arrow collapses selection then moves up', async ({ page }) => {
    // Create two lines
    await page.keyboard.type('S r g m');
    await page.keyboard.press('Enter');
    await page.keyboard.type('P d n s');

    // Select some characters on second line
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    // Press up arrow - should collapse selection and move up
    await page.keyboard.press('ArrowUp');

    // Type X - should appear on first line
    await page.keyboard.type('X');

    // Check document model
    await page.getByTestId('tab-docmodel').click();
    const docmodel = page.getByTestId('pane-docmodel');
    await expect(docmodel).toBeVisible();
    const content = await docmodel.innerText();

    // Should have X in the document
    expect(content).toContain('char: "X"');
  });
});
