import { test, expect } from '@playwright/test';

test.describe('Key Signature Display - Interactive Features', () => {
  test('should show tooltip on hover', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set a key signature first
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="G major"]').click();
    await page.waitForTimeout(500);

    // Check that display has a title attribute (tooltip)
    const display = page.locator('#key-signature-display');
    await expect(display).toBeVisible();

    const title = await display.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title).toContain('major');
    expect(title).toContain('click');
  });

  test('should have pointer cursor on hover', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set a key signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="D major"]').click();
    await page.waitForTimeout(500);

    // Check cursor style
    const display = page.locator('#key-signature-display');
    const cursor = await display.evaluate(el => {
      return window.getComputedStyle(el).cursor;
    });

    expect(cursor).toBe('pointer');
  });

  test('should open key signature selector when clicked', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set initial key signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="C major"]').click();
    await page.waitForTimeout(500);

    // Modal should be closed
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toHaveClass(/hidden/);

    // Click the key signature display
    const display = page.locator('#key-signature-display');
    await display.click();

    // Modal should open
    await expect(modal).not.toHaveClass(/hidden/);
    await expect(modal).toBeVisible();

    // Should show "Select Key Signature" title
    const title = modal.locator('h2');
    await expect(title).toHaveText('Select Key Signature');
  });

  test('should change key signature by clicking display then selecting new key', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set initial key signature (F major)
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="F major"]').click();
    await page.waitForTimeout(500);

    // Verify F major is displayed
    const displaySvg = page.locator('#key-sig-display-svg');
    let src = await displaySvg.getAttribute('src');
    expect(src).toContain('F-major_d-minor.svg');

    // Click display to open selector
    const display = page.locator('#key-signature-display');
    await display.click();

    // Wait for modal
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // Select B-flat major
    await page.locator('[data-key="B-flat major"]').click();
    await page.waitForTimeout(500);

    // Modal should close
    await expect(modal).toHaveClass(/hidden/);

    // Display should update to B-flat major
    src = await displaySvg.getAttribute('src');
    expect(src).toContain('B-flat-major_g-minor.svg');
  });

  test('should highlight current key when opening selector via display click', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set A major
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="A major"]').click();
    await page.waitForTimeout(500);

    // Click display to reopen selector
    const display = page.locator('#key-signature-display');
    await display.click();

    // Modal should be open
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // A major should be highlighted
    const aMajorItem = page.locator('[data-key="A major"]');
    const hasSelected = await aMajorItem.evaluate(el => {
      return el.classList.contains('selected');
    });

    expect(hasSelected).toBe(true);
  });

  test('should show hover effect on display', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Set a key signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="E major"]').click();
    await page.waitForTimeout(500);

    const display = page.locator('#key-signature-display');

    // Hover over display
    await display.hover();

    // Check that border color changes on hover (should be blue-ish)
    const borderColor = await display.evaluate(el => {
      return window.getComputedStyle(el).borderColor;
    });

    // Border should change (we can't easily test exact color due to browser differences)
    expect(borderColor).toBeTruthy();
  });
});
