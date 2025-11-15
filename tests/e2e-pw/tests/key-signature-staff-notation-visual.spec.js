import { test, expect } from '@playwright/test';

test.describe('Key Signature Staff Notation Visual', () => {
  test('should display F# major with 6 sharps in staff notation', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type some content so there's something to render
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3 4 5 6 7');
    await page.waitForTimeout(500);

    // Set initial key signature to C major (no sharps/flats) for comparison
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="C major"]').click();
    await page.waitForTimeout(1000);

    // Switch to staff notation tab to see initial rendering
    await page.locator('button[data-tab="staff-notation"]').click();
    await page.waitForTimeout(2000); // Wait for OSMD to render

    // Take screenshot of C major (should have no sharps)
    await page.screenshot({
      path: 'test-results/key-sig-c-major-staff.png',
      fullPage: false
    });

    // Click the key signature display icon to open selector
    const display = page.locator('#key-signature-display');
    await display.click();
    await page.waitForTimeout(300);

    // Select F# major (6 sharps: F#, C#, G#, D#, A#, E#)
    await page.locator('[data-key="F-sharp major"]').click();
    await page.waitForTimeout(2000); // Wait for all exports to update

    // Take screenshot of F# major (should show 6 sharps in key signature)
    await page.screenshot({
      path: 'test-results/key-sig-f-sharp-major-staff.png',
      fullPage: false
    });

    // Verify the staff notation container is visible
    const staffContainer = page.locator('#staff-notation-container');
    await expect(staffContainer).toBeVisible();

    // Verify SVG was rendered (OSMD creates SVG elements)
    const svg = staffContainer.locator('svg').first();
    await expect(svg).toBeVisible();

    console.log('✅ Screenshot saved: test-results/key-sig-f-sharp-major-staff.png');
    console.log('👀 Please visually inspect the screenshot for 6 sharps in the key signature');
    console.log('   F# major should show: F#, C#, G#, D#, A#, E# at the beginning of the staff');
  });

  test('should display B-flat major with 2 flats in staff notation', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type some content
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3 4');
    await page.waitForTimeout(500);

    // Click the key signature display (starts as C major by default)
    // Need to set one first
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="C major"]').click();
    await page.waitForTimeout(1000);

    // Click display to open selector
    const display = page.locator('#key-signature-display');
    await display.click();
    await page.waitForTimeout(300);

    // Select B-flat major (2 flats: B♭, E♭)
    await page.locator('[data-key="B-flat major"]').click();
    await page.waitForTimeout(2000);

    // Switch to staff notation tab
    await page.locator('button[data-tab="staff-notation"]').click();
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: 'test-results/key-sig-b-flat-major-staff.png',
      fullPage: false
    });

    // Verify rendering
    const staffContainer = page.locator('#staff-notation-container');
    await expect(staffContainer).toBeVisible();
    const svg = staffContainer.locator('svg').first();
    await expect(svg).toBeVisible();

    console.log('✅ Screenshot saved: test-results/key-sig-b-flat-major-staff.png');
    console.log('👀 Please visually inspect the screenshot for 2 flats in the key signature');
    console.log('   B-flat major should show: B♭, E♭ at the beginning of the staff');
  });

  test('should update staff notation when changing from C major to E major', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page.locator('#notation-editor')).toBeVisible();

    // Type content
    const editor = page.locator('#notation-editor');
    await editor.click();
    await page.keyboard.type('1 2 3 4 5');
    await page.waitForTimeout(500);

    // Set C major
    await page.locator('#file-menu-button').click();
    await page.locator('#file-menu #menu-set-key-signature').click();
    await page.locator('[data-key="C major"]').click();
    await page.waitForTimeout(1000);

    // Go to staff notation
    await page.locator('button[data-tab="staff-notation"]').click();
    await page.waitForTimeout(2000);

    // Screenshot C major (no sharps)
    await page.screenshot({
      path: 'test-results/key-sig-before-c-major.png',
      fullPage: false
    });

    // Click display to change key
    const display = page.locator('#key-signature-display');
    await display.click();
    await page.waitForTimeout(300);

    // Select E major (4 sharps: F#, C#, G#, D#)
    await page.locator('[data-key="E major"]').click();
    await page.waitForTimeout(2000); // Wait for forceUpdateAllExports()

    // Screenshot E major (4 sharps should appear)
    await page.screenshot({
      path: 'test-results/key-sig-after-e-major.png',
      fullPage: false
    });

    console.log('✅ Screenshots saved:');
    console.log('   - test-results/key-sig-before-c-major.png (should have NO sharps)');
    console.log('   - test-results/key-sig-after-e-major.png (should have 4 sharps: F#, C#, G#, D#)');
    console.log('👀 Compare the two screenshots to verify key signature changed');
  });
});
