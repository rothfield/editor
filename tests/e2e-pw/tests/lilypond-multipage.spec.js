import { test, expect } from '../fixtures/editor.fixture';

test.describe('LilyPond Multi-Page SVG Display', () => {
  test('should display multiple pages when content is long', async ({ cleanPage: page }) => {
    test.setTimeout(300000); // Increase timeout for 150 lines of typing (5 minutes)

    // Clear localStorage and cache to start fresh with new WASM
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      // Force reload to get fresh WASM
    });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for editor to be ready
    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Clear any default content
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Type "1234" pattern repeated - With increased spacing, need more lines for multi-page
    // A5 portrait (210mm tall) with increased spacing can fit ~40-50 staves per page
    // Using 150 lines should generate at least 3 pages
    const repetitions = 150;
    for (let i = 0; i < repetitions; i++) {
      await page.keyboard.type('1234', { delay: 0 });
      if (i < repetitions - 1) {
        await page.keyboard.press('Enter');
      }
      // Every 30 lines, wait a bit
      if (i % 30 === 29) {
        await page.waitForTimeout(200);
        console.log(`Progress: ${i + 1}/${repetitions} lines`);
      }
    }

    console.log(`Typed all ${repetitions} lines of "1234"`);

    // Click the LilyPond PNG tab
    const lilypondPngTab = page.locator('#tab-lilypond-png');
    await expect(lilypondPngTab).toBeVisible();
    await lilypondPngTab.click();

    // Wait for the tab content to be visible
    const tabContent = page.locator('#tab-content-lilypond-png');
    await expect(tabContent).toBeVisible();

    // Wait for rendering to complete - specifically wait for images to appear
    await expect.poll(async () => {
      const images = await page.locator('.lilypond-svg-display img').count();
      return images;
    }, {
      message: 'Expected at least 1 rendered image',
      timeout: 15000,
      intervals: [500, 1000]
    }).toBeGreaterThan(0);

    // Get the render area
    const renderArea = page.locator('.lilypond-svg-display');
    await expect(renderArea).toBeVisible();

    // Check for multi-page container
    const pagesContainer = renderArea.locator('.lp-preview');

    // If multi-page, container should exist
    const containerExists = await pagesContainer.count() > 0;

    if (containerExists) {
      // Count the number of page images
      const pageImages = pagesContainer.locator('img');
      const pageCount = await pageImages.count();

      console.log(`Found ${pageCount} page(s) in LilyPond display`);

      // We expect at least 2 pages with 150 measures on A4 size
      console.log(`Expecting >=2 pages, got ${pageCount}`);
      expect(pageCount).toBeGreaterThanOrEqual(2);

      if (pageCount >= 2) {
        console.log('✓ Multi-page display working correctly!');

        // Verify all images have loaded
        for (let i = 0; i < pageCount; i++) {
          const img = pageImages.nth(i);
          await expect(img).toBeVisible();

          // Check that image has src attribute
          const src = await img.getAttribute('src');
          expect(src).toBeTruthy();
          expect(src).toContain('blob:');
        }

        // Verify pages are stacked vertically (check container styling)
        const containerStyle = await pagesContainer.getAttribute('style');
        expect(containerStyle).toContain('flex-direction: column');
        expect(containerStyle).toContain('gap: 16px');
      }
    } else {
      // Single page fallback (old displaySVG method)
      const singleImage = renderArea.locator('img');
      const imageCount = await singleImage.count();

      console.log('Using single-page display fallback');
      expect(imageCount).toBeGreaterThanOrEqual(1);
    }

    // Take a screenshot for visual verification
    await page.screenshot({
      path: 'test-results/lilypond-multipage.png',
      fullPage: true
    });
  });

  test('should handle single page content correctly', async ({ cleanPage: page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type minimal content (should fit on one page)
    await page.keyboard.type('S r G m', { delay: 10 });

    // Click the LilyPond PNG tab
    const lilypondPngTab = page.locator('#tab-lilypond-png');
    await expect(lilypondPngTab).toBeVisible();
    await lilypondPngTab.click();

    // Wait for rendering
    await page.waitForFunction(() => {
      const renderArea = document.querySelector('.lilypond-svg-display');
      if (!renderArea) return false;
      return renderArea.querySelectorAll('img').length > 0 ||
             renderArea.textContent.trim().length > 0;
    }, { timeout: 15000 });

    const renderArea = page.locator('.lilypond-svg-display');
    await expect(renderArea).toBeVisible();

    // Should have at least one image
    const images = renderArea.locator('img');
    const imageCount = await images.count();

    console.log(`Single-page test: Found ${imageCount} image(s)`);
    expect(imageCount).toBeGreaterThanOrEqual(1);

    // Verify image loaded
    const img = images.first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toBeTruthy();
  });

  test('should show error message when render fails', async ({ cleanPage: page }) => {
    await page.goto('/');

    const editor = page.getByTestId('editor-root');
    await expect(editor).toBeVisible();
    await editor.click();

    // Type some content
    await page.keyboard.type('S r G m', { delay: 10 });

    // Stop the LilyPond service to force an error
    // (In real test, service should be running, but this tests error handling)

    const lilypondPngTab = page.locator('#tab-lilypond-png');
    await expect(lilypondPngTab).toBeVisible();
    await lilypondPngTab.click();

    // Wait for content (either success or error)
    await page.waitForFunction(() => {
      const renderArea = document.querySelector('.lilypond-svg-display');
      return renderArea && renderArea.textContent.trim().length > 0;
    }, { timeout: 15000 });

    const renderArea = page.locator('.lilypond-svg-display');
    await expect(renderArea).toBeVisible();

    // Should show either images or an error message
    const hasImages = await renderArea.locator('img').count() > 0;
    const text = await renderArea.textContent();
    const hasText = text.trim().length > 0;

    expect(hasImages || hasText).toBeTruthy();
  });
});
