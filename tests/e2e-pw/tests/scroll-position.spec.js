import { test, expect } from '@playwright/test';

test.describe('Scroll Position Preservation', () => {
  test('should maintain scroll position when typing', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type enough content to make the editor scrollable (shorter strings for speed)
    console.log('Creating scrollable content...');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.type('S r |');
      await page.keyboard.press('Enter');
    }

    // Wait for rendering to complete
    await page.waitForTimeout(500);

    // Get the scroll container
    const scrollContainer = page.locator('#editor-container');

    // Scroll down manually
    console.log('Scrolling down...');
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 300;
      el.scrollLeft = 50;
    });

    // Wait a bit for scroll to settle
    await page.waitForTimeout(100);

    // Capture scroll position before typing
    const scrollBeforeTyping = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Scroll before typing: top=${scrollBeforeTyping.top}, left=${scrollBeforeTyping.left}`);

    // Verify we actually scrolled
    expect(scrollBeforeTyping.top).toBeGreaterThan(100);

    // Type a single character
    console.log('Typing character...');
    await page.keyboard.type('X');

    // Wait for render cycle to complete
    await page.waitForTimeout(300);

    // Check scroll position after typing
    const scrollAfterTyping = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Scroll after typing: top=${scrollAfterTyping.top}, left=${scrollAfterTyping.left}`);

    // ASSERTION: Scroll position should be preserved (within 5px tolerance)
    expect(scrollAfterTyping.top).toBeGreaterThanOrEqual(scrollBeforeTyping.top - 5);
    expect(scrollAfterTyping.top).toBeLessThanOrEqual(scrollBeforeTyping.top + 5);
    expect(scrollAfterTyping.left).toBeGreaterThanOrEqual(scrollBeforeTyping.left - 5);
    expect(scrollAfterTyping.left).toBeLessThanOrEqual(scrollBeforeTyping.left + 5);
  });

  test('should maintain scroll position when using navigation keys', async ({ page }) => {
    // Navigate to the editor
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Create scrollable content
    for (let i = 0; i < 25; i++) {
      await page.keyboard.type('S r g m P |');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(500);

    const scrollContainer = page.locator('#editor-container');

    // Scroll down
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 200;
      el.scrollLeft = 30;
    });

    await page.waitForTimeout(100);

    const scrollBeforeNav = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Scroll before navigation: top=${scrollBeforeNav.top}, left=${scrollBeforeNav.left}`);

    // Use arrow keys to navigate
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');

    await page.waitForTimeout(300);

    const scrollAfterNav = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Scroll after navigation: top=${scrollAfterNav.top}, left=${scrollAfterNav.left}`);

    // Scroll should be preserved during navigation
    expect(scrollAfterNav.top).toBeGreaterThanOrEqual(scrollBeforeNav.top - 5);
    expect(scrollAfterNav.top).toBeLessThanOrEqual(scrollBeforeNav.top + 5);
  });

  test('should maintain scroll position when deleting text', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Create content (shorter for speed)
    for (let i = 0; i < 25; i++) {
      await page.keyboard.type('S r |');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(500);

    const scrollContainer = page.locator('#editor-container');

    // Scroll down
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 250;
    });

    await page.waitForTimeout(100);

    const scrollBefore = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Scroll before delete: top=${scrollBefore.top}, left=${scrollBefore.left}`);

    // Delete a character
    await page.keyboard.press('Backspace');

    await page.waitForTimeout(300);

    const scrollAfter = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Scroll after delete: top=${scrollAfter.top}, left=${scrollAfter.left}`);

    // Scroll should be preserved
    expect(scrollAfter.top).toBeGreaterThanOrEqual(scrollBefore.top - 5);
    expect(scrollAfter.top).toBeLessThanOrEqual(scrollBefore.top + 5);
  });

  test('should collect console logs showing scroll behavior', async ({ page }) => {
    // Collect console logs to see what's happening
    const logs = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Renderer]') || text.includes('insertText') || text.includes('render()')) {
        logs.push(text);
      }
    });

    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Create scrollable content
    for (let i = 0; i < 25; i++) {
      await page.keyboard.type('S r g |');
      await page.keyboard.press('Enter');
    }

    await page.waitForTimeout(500);

    const scrollContainer = page.locator('#editor-container');

    // Scroll down
    await scrollContainer.evaluate((el) => {
      el.scrollTop = 300;
      el.scrollLeft = 50;
    });

    await page.waitForTimeout(100);

    // Clear previous logs
    logs.length = 0;

    // Type a character and watch the logs
    await page.keyboard.type('X');

    await page.waitForTimeout(500);

    // Print collected logs
    console.log('\n=== Console Logs During Typing ===');
    logs.forEach(log => console.log(log));
    console.log('=== End Logs ===\n');

    // Get final scroll position
    const finalScroll = await scrollContainer.evaluate((el) => ({
      top: el.scrollTop,
      left: el.scrollLeft
    }));

    console.log(`Final scroll position: top=${finalScroll.top}, left=${finalScroll.left}`);

    // The test will fail if scroll resets to 0,0
    expect(finalScroll.top).toBeGreaterThan(100);
  });
});
