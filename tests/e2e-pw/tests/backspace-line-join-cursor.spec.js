import { test, expect } from '@playwright/test';

test.describe('Backspace Line Join Cursor Position', () => {
  test('cursor should be after previous line content when backspacing at start of line', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "12"
    await page.keyboard.type('12');

    // Press Enter to create new line
    await page.keyboard.press('Enter');

    // Type "3" on new line
    await page.keyboard.type('3');

    // Move to start of line 1
    await page.keyboard.press('Home');

    // Press Backspace at start of line 1 (should join lines)
    await page.keyboard.press('Backspace');

    // Now type "X" to verify cursor position
    // If cursor is correctly at position 2 (after "12"), the result should be "12X3"
    // If cursor is wrong (e.g., at position 0), the result would be "X123"
    // If cursor is wrong (e.g., at position 3), the result would be "123X"
    await page.keyboard.type('X');

    // Open Doc Model inspector to verify the result
    const docModelTab = page.getByTestId('tab-docmodel');
    await expect(docModelTab).toBeVisible();
    await docModelTab.click();

    const docModelPane = page.getByTestId('pane-docmodel');
    await expect(docModelPane).toBeVisible();

    // Wait for content to populate
    await expect.poll(async () => {
      const text = await docModelPane.innerText();
      return text.trim().length;
    }).toBeGreaterThan(0);

    const docModelText = await docModelPane.innerText();

    // Verify we have only one line
    const lineMatches = docModelText.match(/lines:\s*-/g);
    expect(lineMatches).toHaveLength(1);

    // Verify the characters appear in correct order: 1, 2, X, 3
    // Extract all char values
    const charMatches = [...docModelText.matchAll(/char:\s*"(.+?)"/g)];
    const chars = charMatches.map(m => m[1]);

    // Should have exactly 4 characters
    expect(chars).toHaveLength(4);

    // Verify order: 1, 2, X, 3
    expect(chars[0]).toBe('1');
    expect(chars[1]).toBe('2');
    expect(chars[2]).toBe('X');
    expect(chars[3]).toBe('3');
  });

  test('cursor position after multiple backspaces across line boundaries', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Create multi-line content
    await page.keyboard.type('ab');
    await page.keyboard.press('Enter');
    await page.keyboard.type('cd');
    await page.keyboard.press('Enter');
    await page.keyboard.type('ef');

    // Now we have:
    // Line 0: "ab"
    // Line 1: "cd"
    // Line 2: "ef" <- cursor here at end

    // Move to start of line 2
    await page.keyboard.press('Home');

    // First backspace: should join line 2 to line 1, cursor should be after "cd"
    await page.keyboard.press('Backspace');

    // Type "X" to mark position
    await page.keyboard.type('X');

    // Move to start of current line (line 1 with "cdXef")
    await page.keyboard.press('Home');

    // Second backspace: should join line 1 to line 0, cursor should be after "ab"
    await page.keyboard.press('Backspace');

    // Type "Y" to mark this position
    await page.keyboard.type('Y');

    // Open Doc Model to verify
    const docModelTab = page.getByTestId('tab-docmodel');
    await docModelTab.click();

    const docModelPane = page.getByTestId('pane-docmodel');
    await expect.poll(async () => {
      const text = await docModelPane.innerText();
      return text.trim().length;
    }).toBeGreaterThan(0);

    const docModelText = await docModelPane.innerText();

    // Verify we have only one line
    const lineMatches = docModelText.match(/lines:\s*-/g);
    expect(lineMatches).toHaveLength(1);

    // Extract all char values
    const charMatches = [...docModelText.matchAll(/char:\s*"(.+?)"/g)];
    const chars = charMatches.map(m => m[1]);

    // Should have: a, b, Y, c, d, X, e, f
    expect(chars).toHaveLength(8);
    expect(chars[0]).toBe('a');
    expect(chars[1]).toBe('b');
    expect(chars[2]).toBe('Y');  // Marker after first line join
    expect(chars[3]).toBe('c');
    expect(chars[4]).toBe('d');
    expect(chars[5]).toBe('X');  // Marker after second line join
    expect(chars[6]).toBe('e');
    expect(chars[7]).toBe('f');
  });

  test('cursor position when backspacing empty line', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type "12", Enter, Enter (creates empty line), "3"
    await page.keyboard.type('12');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('3');

    // Now we have:
    // Line 0: "12"
    // Line 1: "" (empty)
    // Line 2: "3" <- cursor at end

    // Move to start of line 2
    await page.keyboard.press('Home');

    // Backspace should remove empty line 1
    await page.keyboard.press('Backspace');

    // Type "X" to mark cursor position
    await page.keyboard.type('X');

    // Check doc model
    const docModelTab = page.getByTestId('tab-docmodel');
    await docModelTab.click();

    const docModelPane = page.getByTestId('pane-docmodel');
    await expect.poll(async () => {
      const text = await docModelPane.innerText();
      return text.trim().length;
    }).toBeGreaterThan(0);

    const docModelText = await docModelPane.innerText();

    // Should have 2 lines (line 0: "12", line 1: "X3")
    // Count lines by looking for "label:" at the line level (each line has this field)
    const lineMatches = docModelText.match(/label: ""/g);
    expect(lineMatches).not.toBeNull();
    expect(lineMatches.length).toBe(2);

    // Extract all char values
    const charMatches = [...docModelText.matchAll(/char:\s*"(.+?)"/g)];
    const chars = charMatches.map(m => m[1]);

    // Should have: 1, 2 in first line, and X, 3 in second line
    expect(chars).toHaveLength(4);
    expect(chars[0]).toBe('1');
    expect(chars[1]).toBe('2');
    expect(chars[2]).toBe('X');  // X should appear at start of line 1 (after empty line was removed)
    expect(chars[3]).toBe('3');
  });
});
