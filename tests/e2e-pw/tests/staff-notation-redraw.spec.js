import { test, expect } from '@playwright/test';

test.describe('Staff Notation Tab Click Redraw', () => {
  test('should redraw staff notation when clicking the tab after switching away', async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type some notation
    await editor.click();
    await page.keyboard.type('S-- r-');

    // Wait for initial render
    const staffNotationContainer = page.locator('#staff-notation-container');
    const svgElements = page.locator('#staff-notation-container svg');
    await expect(svgElements.first()).toBeVisible({ timeout: 5000 });

    // Get the initial SVG HTML content
    const initialSvgHtml = await staffNotationContainer.innerHTML();
    console.log('Initial SVG HTML length:', initialSvgHtml.length);

    // Switch to another tab (lilypond)
    const lilypondTab = page.getByTestId('tab-lilypond');
    await lilypondTab.click();
    await page.waitForTimeout(200);

    // Modify the notation while on another tab
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' g-m');

    // Now click back to staff notation tab
    const staffNotationTab = page.locator('[data-tab="staff-notation"]');
    await staffNotationTab.click();
    await page.waitForTimeout(500);

    // Get the SVG HTML content after clicking the tab
    const updatedSvgHtml = await staffNotationContainer.innerHTML();
    console.log('Updated SVG HTML length:', updatedSvgHtml.length);

    // FAILING TEST: The SVG should have been redrawn with the new notation
    // This should show different content from the initial render
    expect(updatedSvgHtml).not.toEqual(initialSvgHtml);
  });

  test('should trigger renderStaffNotation when clicking the staff notation tab', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type('S--');

    // Wait for initial render
    const svgElements = page.locator('#staff-notation-container svg');
    await expect(svgElements.first()).toBeVisible({ timeout: 5000 });

    // Set up a check for renderStaffNotation being called
    const renderCalls = await page.evaluate(() => {
      return new Promise((resolve) => {
        const originalRender = window.MusicNotationApp?.app()?.editor?.renderStaffNotation;
        let callCount = 0;

        if (originalRender) {
          window.MusicNotationApp.app().editor.renderStaffNotation = async function(...args) {
            callCount++;
            console.log('renderStaffNotation called, count:', callCount);
            return originalRender.apply(this, args);
          };
        }

        // Store the call count getter
        window.getRenderCallCount = () => callCount;
        resolve(callCount);
      });
    });

    // Switch to lilypond
    const lilypondTab = page.getByTestId('tab-lilypond');
    await lilypondTab.click();
    await page.waitForTimeout(200);

    // Get initial call count
    const initialCallCount = await page.evaluate(() => window.getRenderCallCount?.() || 0);
    console.log('Initial render call count:', initialCallCount);

    // Modify notation
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' r');

    // Click back to staff notation
    const staffNotationTab = page.locator('[data-tab="staff-notation"]');
    await staffNotationTab.click();
    await page.waitForTimeout(500);

    // Check if renderStaffNotation was called
    const finalCallCount = await page.evaluate(() => window.getRenderCallCount?.() || 0);
    console.log('Final render call count:', finalCallCount);

    // FAILING TEST: renderStaffNotation should have been called when clicking the tab
    expect(finalCallCount).toBeGreaterThan(initialCallCount);
  });
});
