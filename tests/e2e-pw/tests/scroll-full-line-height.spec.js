import { test, expect } from '@playwright/test';

test('should scroll full line height including beat loops into view', async ({ page }) => {
  await page.goto('/');

  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Create multiple lines with beats to create beat loops that extend below cells
  console.log('Creating lines with beat loops...');

  // Create 10 lines to force scrolling
  for (let i = 0; i < 10; i++) {
    await page.keyboard.type('S r g m P d n S');
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(500);

  const scrollContainer = page.locator('#editor-container');

  // Move cursor to first line
  await page.keyboard.press('Control+Home');
  await page.waitForTimeout(200);

  // Scroll down significantly so first line is off-screen
  console.log('Scrolling to hide first line...');
  await scrollContainer.evaluate((el) => {
    el.scrollTop = 400; // Scroll down significantly
  });

  await page.waitForTimeout(300);

  // Check if first line is off-screen
  const lineOffScreen = await page.evaluate(() => {
    const scrollContainer = document.getElementById('editor-container');
    const firstLine = document.querySelector('[data-line="0"]');

    if (!firstLine || !scrollContainer) {
      return { offScreen: false, debug: 'Elements not found' };
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const lineRect = firstLine.getBoundingClientRect();

    // Get the line's actual height from its style
    const lineHeight = parseFloat(firstLine.style.height) || lineRect.height;

    // Line is off-screen if its bottom is above the container top
    const offScreen = lineRect.bottom < containerRect.top;

    return {
      offScreen,
      lineBottom: lineRect.bottom,
      containerTop: containerRect.top,
      lineHeight,
      debug: `line.bottom=${lineRect.bottom}, container.top=${containerRect.top}, lineHeight=${lineHeight}`
    };
  });

  console.log('First line off-screen check:', lineOffScreen);

  if (!lineOffScreen.offScreen) {
    console.log('SKIP: First line not off-screen. Need taller content or shorter viewport.');
    test.skip();
    return;
  }

  // Get scroll position before navigation
  const scrollBefore = await scrollContainer.evaluate((el) => el.scrollTop);
  console.log(`Scroll before navigation: ${scrollBefore}`);

  // Press Home to move to first line - should scroll ENTIRE line into view
  await page.keyboard.press('Home');
  await page.waitForTimeout(500);

  // Verify entire first line is now visible (including beat loops below)
  const lineVisibility = await page.evaluate(() => {
    const scrollContainer = document.getElementById('editor-container');
    const firstLine = document.querySelector('[data-line="0"]');

    if (!firstLine || !scrollContainer) {
      return { fullLineVisible: false, debug: 'Elements not found' };
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const lineRect = firstLine.getBoundingClientRect();

    // Get the line's declared height (which should include beat loops)
    const lineHeight = parseFloat(firstLine.style.height);

    // Calculate the actual bottom of the line content
    const lineContentBottom = lineRect.top + lineHeight;

    // Check if entire line (top to content bottom) is within viewport
    const topVisible = lineRect.top >= containerRect.top;
    const bottomVisible = lineContentBottom <= containerRect.bottom;
    const fullLineVisible = topVisible && bottomVisible;

    return {
      fullLineVisible,
      topVisible,
      bottomVisible,
      lineTop: lineRect.top,
      lineContentBottom,
      containerTop: containerRect.top,
      containerBottom: containerRect.bottom,
      lineHeight,
      debug: `Line: ${lineRect.top} to ${lineContentBottom}, Container: ${containerRect.top} to ${containerRect.bottom}`
    };
  });

  console.log('Line visibility after scroll:', lineVisibility);

  // Get scroll position after navigation
  const scrollAfter = await scrollContainer.evaluate((el) => el.scrollTop);
  console.log(`Scroll after navigation: ${scrollAfter}`);

  // ASSERTIONS:
  // 1. Scroll position should have changed (scrolled up)
  expect(scrollAfter).toBeLessThan(scrollBefore);

  // 2. Entire line should be visible (including beat loops and any content below cells)
  expect(lineVisibility.fullLineVisible).toBe(true);
  expect(lineVisibility.topVisible).toBe(true);
  expect(lineVisibility.bottomVisible).toBe(true);
});
