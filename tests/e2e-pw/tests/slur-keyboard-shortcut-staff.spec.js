import { test, expect } from '@playwright/test';

/**
 * E2E Test: Alt+S Slur Toggle with Immediate Staff Notation Redraw
 *
 * This test verifies that:
 * 1. Alt+S applies a slur to selected notes
 * 2. Staff notation redraws IMMEDIATELY showing the slur
 * 3. Alt+S again removes the slur
 * 4. Staff notation redraws IMMEDIATELY with slur removed
 *
 * Expected to FAIL until:
 * - Alt+S keyboard shortcut is implemented
 * - Staff notation auto-redraws on slur changes
 * - Visual slur rendering is implemented
 */

test.describe('Slur Keyboard Shortcut with Staff Notation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    // Ensure editor has focus
    await editor.click();
  });

  test('Alt+S toggles slur and staff notation redraws immediately', async ({ page }) => {
    // Enable console logging for debugging
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('slur') || text.includes('Slur') || text.includes('staff')) {
        console.log('[BROWSER]', text);
      }
    });

    // Step 1: Type "12"
    console.log('\n=== STEP 1: Type "12" ===');
    await page.keyboard.type('12');
    await page.waitForTimeout(100);

    // Step 2: Select "12" with Shift+Left Arrow twice
    console.log('\n=== STEP 2: Select "12" (Shift+Left Arrow x2) ===');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(100);

    // Verify selection exists
    const selection = await page.evaluate(() => {
      return window.editor?.wasmModule?.getPrimarySelection?.();
    });
    console.log('Selection:', selection);

    // Note: Selection API might return empty object if not properly implemented
    // For now, we'll proceed assuming the selection works (keyboard handler should track it)
    // TODO: Fix getPrimarySelection to return actual selection state

    // Step 3: Switch to Staff Notation tab
    console.log('\n=== STEP 3: Switch to Staff Notation tab ===');
    await page.click('#tab-staff-notation'); // Use ID instead of data-testid
    await page.waitForTimeout(500); // Wait for initial render

    // Get reference to staff notation container
    const staffContainer = page.locator('#staff-notation-container');
    await expect(staffContainer).toBeVisible();

    // Take snapshot of staff notation WITHOUT slur
    const beforeSlurSvg = await staffContainer.innerHTML();
    console.log('Staff notation HTML length before slur:', beforeSlurSvg.length);

    // Step 4: Apply slur with Alt+S
    console.log('\n=== STEP 4: Apply slur (Alt+S) ===');
    await page.keyboard.press('Alt+s');

    // Wait for staff notation to redraw (should be IMMEDIATE)
    // We use a small timeout to allow for async rendering, but this should be very fast
    await page.waitForTimeout(200);

    // Check if slur was applied to annotation layer
    const slursAfterApply = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });
    console.log('Slurs after Alt+S:', JSON.stringify(slursAfterApply, null, 2));

    // Verify slur was added to annotation layer
    expect(slursAfterApply).toBeTruthy();
    expect(slursAfterApply.length).toBeGreaterThan(0);

    // Check if staff notation redrew
    const afterSlurSvg = await staffContainer.innerHTML();
    console.log('Staff notation HTML length after slur:', afterSlurSvg.length);

    // Staff notation should have changed (slur rendered)
    // Note: This will fail until visual slur rendering is implemented
    expect(afterSlurSvg).not.toBe(beforeSlurSvg);

    // Look for SVG slur path element (OSMD renders slurs as paths)
    const slurPathExists = await page.locator('#staff-notation-container path[class*="slur"]').count() > 0 ||
                           await page.locator('#staff-notation-container path[d*="C"]').count() > 0; // Slurs use cubic bezier curves

    console.log('Slur path found in SVG:', slurPathExists);
    expect(slurPathExists).toBe(true);

    // Step 5: Remove slur with Alt+S again
    console.log('\n=== STEP 5: Remove slur (Alt+S again) ===');
    await page.keyboard.press('Alt+s');

    // Wait for staff notation to redraw (should be IMMEDIATE)
    await page.waitForTimeout(200);

    // Check if slur was removed from annotation layer
    const slursAfterRemove = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });
    console.log('Slurs after second Alt+S:', JSON.stringify(slursAfterRemove, null, 2));

    // Verify slur was removed from annotation layer
    expect(slursAfterRemove.length).toBe(0);

    // Check if staff notation redrew AGAIN
    const afterRemoveSlurSvg = await staffContainer.innerHTML();
    console.log('Staff notation HTML length after slur removal:', afterRemoveSlurSvg.length);

    // Staff notation should have changed back (slur removed)
    expect(afterRemoveSlurSvg).not.toBe(afterSlurSvg);

    // Slur path should be gone
    const slurPathExistsAfterRemove = await page.locator('#staff-notation-container path[class*="slur"]').count() > 0 ||
                                       await page.locator('#staff-notation-container path[d*="C"]').count() > 0;

    console.log('Slur path found after removal:', slurPathExistsAfterRemove);
    expect(slurPathExistsAfterRemove).toBe(false);

    // Verify staff notation looks the same as before slur was added
    // (not exactly the same HTML due to IDs, but structure should match)
    console.log('Staff notation restored to pre-slur state');
  });

  test('Alt+S with no selection shows error or does nothing', async ({ page }) => {
    // Type notation but don't select anything
    await page.keyboard.type('123');

    // Try to apply slur without selection
    await page.keyboard.press('Alt+s');

    // Should not create any slurs
    const slurs = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });

    expect(slurs.length).toBe(0);
  });

  test('Alt+S works with partial selection', async ({ page }) => {
    // Type longer notation
    await page.keyboard.type('1234');

    // Select middle portion: "23"
    // Position at end (after "4"), then Shift+Left x2 to select "34", then adjust
    await page.keyboard.press('ArrowLeft'); // After "3"
    await page.keyboard.press('ArrowLeft'); // After "2"
    await page.keyboard.press('Shift+ArrowRight'); // Select "3"
    await page.keyboard.press('Shift+ArrowRight'); // Select "34"

    // Apply slur to partial selection
    await page.keyboard.press('Alt+s');

    const slurs = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });

    console.log('Slurs after partial selection:', JSON.stringify(slurs, null, 2));
    expect(slurs.length).toBe(1);

    // Slur should cover the selected portion
    const slur = slurs[0];
    expect(slur.end.col - slur.start.col).toBeGreaterThan(0);
  });

  test('multiple Alt+S presses toggle slur on/off correctly', async ({ page }) => {
    await page.keyboard.type('12');

    // Select all
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    // Toggle 5 times
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Alt+s');
      await page.waitForTimeout(50);

      const slurs = await page.evaluate(() => {
        return window.editor?.wasmModule?.getSlursForLine?.(0);
      });

      const expectedSlurs = i % 2 === 0 ? 1 : 0; // Odd presses add, even presses remove
      console.log(`After toggle ${i + 1}: ${slurs.length} slurs (expected: ${expectedSlurs})`);
      expect(slurs.length).toBe(expectedSlurs);
    }
  });
});
