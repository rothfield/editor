import { test, expect } from '@playwright/test';

test.describe('Key Signature Selector', () => {
  test('should open Circle of Fifths modal from File menu', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Open File menu
    const fileMenuButton = page.locator('#file-menu-button');
    await fileMenuButton.click();

    // Click "Set Key Signature..." menu item (File menu specific)
    const keySignatureMenuItem = page.locator('#file-menu #menu-set-key-signature');
    await expect(keySignatureMenuItem).toBeVisible();
    await keySignatureMenuItem.click();

    // Check that the modal appears
    const modal = page.locator('#key-signature-modal');
    await expect(modal).not.toHaveClass(/hidden/);
    await expect(modal).toBeVisible();

    // Verify modal title
    const modalTitle = modal.locator('h2');
    await expect(modalTitle).toHaveText('Select Key Signature');

    // Verify Circle of Fifths items are visible
    const keyItems = modal.locator('.key-sig-item');
    const itemCount = await keyItems.count();
    expect(itemCount).toBeGreaterThanOrEqual(12); // Should have 12+ key signature options

    // Verify first item (C major) is present
    const cMajorItem = modal.locator('[data-key="C major"]');
    await expect(cMajorItem).toBeVisible();

    // Verify G major item
    const gMajorItem = modal.locator('[data-key="G major"]');
    await expect(gMajorItem).toBeVisible();
  });

  test('should select key signature and close modal', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Wait for editor
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Open File menu and click Set Key Signature
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();

    // Wait for modal
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // Click on G major key signature
    const gMajorItem = modal.locator('[data-key="G major"]');
    await gMajorItem.click();

    // Modal should close after selection (with small delay)
    await page.waitForTimeout(500);
    await expect(modal).toHaveClass(/hidden/);
  });

  test('should close modal when clicking close button', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Wait for editor
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Open key signature selector
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();

    // Wait for modal
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // Click close button
    const closeBtn = page.locator('#key-sig-close');
    await closeBtn.click();

    // Modal should close
    await expect(modal).toHaveClass(/hidden/);
  });

  test('should close modal when clicking overlay', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Wait for editor and ensure JavaScript is loaded
    await expect(page.locator('#notation-editor')).toBeVisible();
    await page.waitForTimeout(500); // Give time for dynamic imports to load

    // Open key signature selector
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();

    // Wait for modal
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();
    await page.waitForTimeout(300); // Give time for event listeners to attach

    // Click outside the modal container (on the overlay background)
    // Position at top-left corner where nothing overlaps
    await page.mouse.click(10, 10);

    // Modal should close
    await expect(modal).toHaveClass(/hidden/);
  });

  test('should toggle between major and minor keys', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Wait for editor
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Open key signature selector
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();

    // Wait for modal
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // Check initial mode label
    const modeLabel = page.locator('#key-sig-mode-label');
    await expect(modeLabel).toHaveText('Show Major Keys');

    // Toggle to minor mode
    const modeToggle = page.locator('#key-sig-mode');
    await modeToggle.check();

    // Label should change
    await expect(modeLabel).toHaveText('Show Minor Keys');

    // Toggle back to major
    await modeToggle.uncheck();
    await expect(modeLabel).toHaveText('Show Major Keys');
  });

  test('should display SVG images for all key signatures', async ({ page }) => {
    await page.goto('http://localhost:8080/');

    // Wait for editor
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Open key signature selector
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();

    // Wait for modal
    const modal = page.locator('#key-signature-modal');
    await expect(modal).toBeVisible();

    // Check that all key signature items have images
    const items = modal.locator('.key-sig-item');
    const count = await items.count();

    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const img = item.locator('img');
      await expect(img).toBeVisible();

      // Verify image src points to key-signatures directory
      const src = await img.getAttribute('src');
      expect(src).toContain('key-signatures/');
      expect(src).toMatch(/\.svg$/);
    }
  });
});
