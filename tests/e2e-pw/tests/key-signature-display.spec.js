import { test, expect } from '@playwright/test';

test.describe('Key Signature Display (Upper Left Corner)', () => {
  test('should show key signature in upper left corner after selection', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Wait for editor to be ready
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Initially, display should be hidden (no key signature set)
    const display = page.locator('#key-signature-display');
    await expect(display).toHaveClass(/hidden/);

    // Open File menu and set key signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();

    // Wait for modal
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // Select G major
    const gMajorItem = modal.locator('[data-key="G major"]');
    await gMajorItem.click();

    // Wait for modal to close
    await page.waitForTimeout(500);
    await expect(modal).toHaveClass(/hidden/);

    // Display should now be visible and show G major SVG
    await expect(display).not.toHaveClass(/hidden/);
    await expect(display).toBeVisible();

    const displaySvg = page.locator('#key-sig-display-svg');
    await expect(displaySvg).toBeVisible();
    const src = await displaySvg.getAttribute('src');
    expect(src).toContain('G-major_e-minor.svg');
  });

  test('should update display when key signature changes', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set first key signature (D major)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="D major"]').click();
    await page.waitForTimeout(500);

    // Verify D major is shown
    const displaySvg = page.locator('#key-sig-display-svg');
    let src = await displaySvg.getAttribute('src');
    expect(src).toContain('D-major_b-minor.svg');

    // Change to A major
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="A major"]').click();
    await page.waitForTimeout(500);

    // Verify A major is now shown
    src = await displaySvg.getAttribute('src');
    expect(src).toContain('A-major_f-sharp-minor.svg');
  });

  test('should show minor key signatures', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Open key signature selector
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();

    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // Toggle to minor mode
    const modeToggle = page.locator('#key-sig-mode');
    await modeToggle.check();

    // Select E minor
    const eMinorItem = modal.locator('[data-key="G major"]'); // E minor is relative to G major
    await eMinorItem.click();
    await page.waitForTimeout(500);

    // Verify E minor is shown (the data-minor value)
    const displaySvg = page.locator('#key-sig-display-svg');
    const src = await displaySvg.getAttribute('src');
    expect(src).toContain('G-major_e-minor.svg'); // E minor shares SVG with G major
  });

  test('should position display in upper left corner', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set a key signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="C major"]').click();
    await page.waitForTimeout(500);

    // Check position
    const display = page.locator('#key-signature-display');
    await expect(display).toBeVisible();

    const box = await display.boundingBox();
    expect(box).not.toBeNull();

    // Should be in upper left (small coordinates)
    expect(box.x).toBeLessThan(100);
    expect(box.y).toBeLessThan(100);
  });

  test('should have small, unobtrusive styling', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set a key signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="F major"]').click();
    await page.waitForTimeout(500);

    const display = page.locator('#key-signature-display');
    await expect(display).toBeVisible();

    // Check SVG width is 64px
    const svgElement = page.locator('#key-sig-display-svg');
    const width = await svgElement.evaluate(el => {
      return window.getComputedStyle(el).width;
    });

    // SVG width should be 64px
    const widthNum = parseInt(width);
    expect(widthNum).toBeGreaterThanOrEqual(62);
    expect(widthNum).toBeLessThanOrEqual(66);

    // Verify it's an SVG image
    const src = await svgElement.getAttribute('src');
    expect(src).toContain('.svg');
  });
});
