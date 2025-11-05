import { test, expect } from '@playwright/test';

test.describe('Staff Notation Visual Update on Tab Click', () => {
  test('should visually update when notation changes and tab is switched back', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    // Type initial notation
    await editor.click();
    await page.keyboard.type('S--');

    // Wait for render
    const staffNotationContainer = page.locator('#staff-notation-container');
    await page.waitForTimeout(500);

    // Take a screenshot of initial render
    const initialScreenshot = await staffNotationContainer.screenshot();

    // Switch to lilypond tab
    const lilypondTab = page.getByTestId('tab-lilypond');
    await lilypondTab.click();
    await page.waitForTimeout(300);

    // While on lilypond tab, add more notation
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' r- g');

    // Now click back to staff notation
    const staffNotationTab = page.locator('[data-tab="staff-notation"]');
    await staffNotationTab.click();
    await page.waitForTimeout(500);

    // Take screenshot of the re-rendered staff notation
    const updatedScreenshot = await staffNotationContainer.screenshot();

    // Compare screenshots - they should be different because we added more notes
    expect(updatedScreenshot).not.toEqual(initialScreenshot);
  });

  test('should have non-empty SVG when clicking staff notation tab', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type('S-- r-');

    // Switch to lilypond
    const lilypondTab = page.getByTestId('tab-lilypond');
    await lilypondTab.click();
    await page.waitForTimeout(200);

    // Click back to staff notation
    const staffNotationTab = page.locator('[data-tab="staff-notation"]');
    await staffNotationTab.click();
    await page.waitForTimeout(300);

    // Check if SVG has content
    const staffNotationContainer = page.locator('#staff-notation-container');
    const svgContent = await staffNotationContainer.innerHTML();

    // SVG should not be empty
    expect(svgContent.length).toBeGreaterThan(100);
    expect(svgContent).toContain('<svg');
  });

  test('should see visible SVG elements after clicking tab', async ({ page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();

    await editor.click();
    await page.keyboard.type('C- D- E');

    // Switch away
    const lilypondTab = page.getByTestId('tab-lilypond');
    await lilypondTab.click();
    await page.waitForTimeout(200);

    // Switch back
    const staffNotationTab = page.locator('[data-tab="staff-notation"]');
    await staffNotationTab.click();
    await page.waitForTimeout(500);

    // Look for actual rendered SVG elements with content
    const svgTexts = page.locator('#staff-notation-container svg text');
    const svgRects = page.locator('#staff-notation-container svg rect');
    const svgPaths = page.locator('#staff-notation-container svg path');

    // Should have some rendered elements
    const textCount = await svgTexts.count();
    const rectCount = await svgRects.count();
    const pathCount = await svgPaths.count();

    console.log(`SVG content: ${textCount} text elements, ${rectCount} rect elements, ${pathCount} path elements`);

    // At least some visual elements should be present
    expect(textCount + rectCount + pathCount).toBeGreaterThan(0);
  });
});
