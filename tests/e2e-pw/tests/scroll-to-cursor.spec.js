import { test, expect } from '@playwright/test';

test.describe('Scroll to Cursor', () => {
  test('should scroll cursor into view when typing off right edge', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type enough content to exceed viewport width
    console.log('Creating long line...');
    await page.keyboard.type('S r g m P d n S r g m P d n S r g m P d n S r g m P');

    // Wait for rendering to complete
    await page.waitForTimeout(500);

    // Get the scroll container
    const scrollContainer = page.locator('#editor-container');

    // Move cursor to end
    await page.keyboard.press('End');
    await page.waitForTimeout(200);

    // Manually scroll container left to hide cursor
    console.log('Scrolling to hide cursor...');
    await scrollContainer.evaluate((el) => {
      el.scrollLeft = 0; // Scroll to beginning
    });

    await page.waitForTimeout(300);

    // Verify cursor is now off-screen to the right
    const checkResult = await page.evaluate(() => {
      const scrollContainer = document.getElementById('editor-container');
      const cursor = document.querySelector('.cursor-indicator');

      if (!cursor || !scrollContainer) {
        return { offScreen: false, debug: 'Elements not found' };
      }

      const cursorRect = cursor.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      // Cursor is off-screen if its left edge is beyond the right edge of container
      const offScreen = cursorRect.left >= containerRect.right - 10; // -10px tolerance

      return {
        offScreen,
        cursorLeft: cursorRect.left,
        containerRight: containerRect.right,
        debug: `cursor.left=${cursorRect.left}, container.right=${containerRect.right}`
      };
    });

    console.log(`Cursor off-screen check:`, checkResult);

    // If cursor isn't naturally off-screen, skip the auto-scroll test
    // (this means viewport is very wide or content isn't long enough)
    if (!checkResult.offScreen) {
      console.log('SKIP: Cursor is not off-screen. Viewport may be too wide for this test.');
      test.skip();
      return;
    }

    // Get initial scroll position
    const scrollBefore = await scrollContainer.evaluate((el) => ({
      left: el.scrollLeft
    }));

    console.log(`Scroll before typing: left=${scrollBefore.left}`);

    // Type a character - this should trigger auto-scroll
    console.log('Typing character (should trigger auto-scroll)...');
    await page.keyboard.type('X');

    // Wait for render and scroll animation
    await page.waitForTimeout(500);

    // Verify cursor is now visible (within viewport)
    const isCursorVisible = await page.evaluate(() => {
      const scrollContainer = document.getElementById('editor-container');
      const cursor = document.querySelector('.cursor-indicator');

      if (!cursor || !scrollContainer) return false;

      const cursorRect = cursor.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      // Cursor is visible if it's within container bounds
      return (
        cursorRect.left >= containerRect.left &&
        cursorRect.right <= containerRect.right &&
        cursorRect.top >= containerRect.top &&
        cursorRect.bottom <= containerRect.bottom
      );
    });

    console.log(`Cursor visible after typing: ${isCursorVisible}`);

    // Get scroll position after typing
    const scrollAfter = await scrollContainer.evaluate((el) => ({
      left: el.scrollLeft
    }));

    console.log(`Scroll after typing: left=${scrollAfter.left}`);

    // ASSERTIONS:
    // 1. Cursor should now be visible
    expect(isCursorVisible).toBe(true);

    // 2. Scroll position should have changed (scrolled right)
    expect(scrollAfter.left).toBeGreaterThan(scrollBefore.left);
  });

  test('should scroll cursor into view when navigating with arrow keys', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type a long line
    console.log('Creating long line...');
    await page.keyboard.type('S r g m P d n S r g m P d n S r g m P d n S r g m P d n');

    await page.waitForTimeout(500);

    const scrollContainer = page.locator('#editor-container');

    // Move cursor to beginning
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);

    // Scroll right so cursor (at beginning) is off-screen
    await scrollContainer.evaluate((el) => {
      el.scrollLeft = 500; // Scroll far to the right
    });

    await page.waitForTimeout(200);

    // Verify cursor is off-screen (to the left)
    const isCursorOffScreenLeft = await page.evaluate(() => {
      const scrollContainer = document.getElementById('editor-container');
      const cursor = document.querySelector('.cursor-indicator');

      if (!cursor || !scrollContainer) return false;

      const cursorRect = cursor.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      return cursorRect.right < containerRect.left;
    });

    console.log(`Cursor off-screen (left): ${isCursorOffScreenLeft}`);
    expect(isCursorOffScreenLeft).toBe(true);

    // Press right arrow - should scroll cursor into view
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);

    // Verify cursor is now visible
    const isCursorVisible = await page.evaluate(() => {
      const scrollContainer = document.getElementById('editor-container');
      const cursor = document.querySelector('.cursor-indicator');

      if (!cursor || !scrollContainer) return false;

      const cursorRect = cursor.getBoundingClientRect();
      const containerRect = scrollContainer.getBoundingClientRect();

      return (
        cursorRect.left >= containerRect.left &&
        cursorRect.right <= containerRect.right
      );
    });

    console.log(`Cursor visible after arrow key: ${isCursorVisible}`);
    expect(isCursorVisible).toBe(true);
  });

  test('should not scroll unnecessarily when cursor already visible', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type moderate content
    await page.keyboard.type('S r g m P');
    await page.waitForTimeout(500);

    const scrollContainer = page.locator('#editor-container');

    // Get initial scroll position (should be 0,0)
    const scrollBefore = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Initial scroll: top=${scrollBefore.top}, left=${scrollBefore.left}`);

    // Type another character while cursor is visible
    await page.keyboard.type('X');
    await page.waitForTimeout(500);

    // Get scroll position after typing
    const scrollAfter = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Scroll after typing: top=${scrollAfter.top}, left=${scrollAfter.left}`);

    // Scroll should not have changed (within small tolerance)
    expect(scrollAfter.top).toBeLessThanOrEqual(scrollBefore.top + 5);
    expect(scrollAfter.left).toBeLessThanOrEqual(scrollBefore.left + 5);
  });
});
