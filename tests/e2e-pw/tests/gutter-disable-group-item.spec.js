/**
 * E2E Test: Context menu should disable "Group item" when no group header above
 */

import { test, expect } from '@playwright/test';

test.describe('Gutter Context Menu - Disable Group Item', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('editor-root')).toBeVisible();
  });

  test('should disable "Group item" when no group header above', async ({ page }) => {
    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Right-click on the first line gutter
    const firstLineGutter = page.locator('.notation-line').first().locator('.line-gutter');
    await firstLineGutter.click({ button: 'right' });

    // Context menu should be visible
    const contextMenu = page.locator('#line-gutter-menu');
    await expect(contextMenu).toBeVisible();

    // "Group item" option should be disabled
    const groupItemOption = contextMenu.locator('[data-choice="group-item"]');
    await expect(groupItemOption).toBeVisible();
    await expect(groupItemOption).toHaveClass(/disabled/);

    // Hover message should be present
    const title = await groupItemOption.getAttribute('title');
    expect(title).toContain('Requires a staff group above');

    // Clicking on disabled item should not work
    await groupItemOption.click();

    // Menu should still be visible (didn't close)
    await expect(contextMenu).toBeVisible();

    // Close menu by clicking elsewhere
    await editor.click();
    await expect(contextMenu).not.toBeVisible();
  });

  test('should enable "Group item" when group header exists above', async ({ page }) => {
    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Create a second line by pressing Enter
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    // Wait for second line to exist
    await expect(page.locator('.notation-line').nth(1)).toBeVisible();

    // Step 1: Set first line as "Staff group" (group-header)
    const firstLineGutter = page.locator('.notation-line').first().locator('.line-gutter');
    await firstLineGutter.click({ button: 'right' });

    const contextMenu = page.locator('#line-gutter-menu');
    await expect(contextMenu).toBeVisible();

    // Click "Staff group" option
    const groupHeaderOption = contextMenu.locator('[data-choice="group-header"]');
    await groupHeaderOption.click();

    // Wait for menu to close and role to update
    await expect(contextMenu).not.toBeVisible();

    // Verify first line now has group-header role
    await expect(page.locator('.notation-line').first()).toHaveAttribute('data-role', 'group-header');

    // Step 2: Right-click on second line (should have group header above now)
    const secondLineGutter = page.locator('.notation-line').nth(1).locator('.line-gutter');
    await secondLineGutter.click({ button: 'right' });

    await expect(contextMenu).toBeVisible();

    // "Group item" option should NOT be disabled now
    const groupItemOption = contextMenu.locator('[data-choice="group-item"]');
    await expect(groupItemOption).toBeVisible();
    await expect(groupItemOption).not.toHaveClass(/disabled/);

    // Title should be empty (not disabled)
    const title = await groupItemOption.getAttribute('title');
    expect(title).toBe('');

    // Close menu
    await editor.click();
  });

  test('should disable "Group item" if melody staff exists between header and current line', async ({ page }) => {
    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Create three lines
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Wait for all three lines to exist
    await expect(page.locator('.notation-line').nth(2)).toBeVisible();

    const contextMenu = page.locator('#line-gutter-menu');

    // Step 1: Set first line as group-header
    const firstLineGutter = page.locator('.notation-line').first().locator('.line-gutter');
    await firstLineGutter.click({ button: 'right' });
    await contextMenu.locator('[data-choice="group-header"]').click();
    await expect(contextMenu).not.toBeVisible();

    // Step 2: Set second line as melody (breaks the group)
    const secondLineGutter = page.locator('.notation-line').nth(1).locator('.line-gutter');
    await secondLineGutter.click({ button: 'right' });
    await expect(contextMenu).toBeVisible();
    await contextMenu.locator('[data-choice="melody"]').click();
    await expect(contextMenu).not.toBeVisible();

    // Step 3: Right-click on third line (melody staff at index 1 breaks the group)
    const thirdLineGutter = page.locator('.notation-line').nth(2).locator('.line-gutter');
    await thirdLineGutter.click({ button: 'right' });

    await expect(contextMenu).toBeVisible();

    // "Group item" should be disabled (melody staff broke the group chain)
    const groupItemOption = contextMenu.locator('[data-choice="group-item"]');
    await expect(groupItemOption).toHaveClass(/disabled/);

    // Close menu
    await editor.click();
  });
});
