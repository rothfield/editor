import { test, expect } from '@playwright/test';

/**
 * Verification Test: Alt+S Uses Layered Slur API
 *
 * This test explicitly verifies that:
 * 1. Alt+S calls applySlurLayered (NOT applySlur)
 * 2. Shift+Alt+S calls removeSlurLayered (NOT removeSlur)
 * 3. Slurs are added to the annotation layer
 * 4. Console logs show the correct API calls
 */

test.describe('Verify Alt+S Uses Layered API', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });

    await editor.click();
  });

  test('Alt+S uses applySlurLayered (NOT applySlur)', async ({ page }) => {
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      console.log('[BROWSER]', text);
    });

    // Type notation and select it
    await page.keyboard.type('12');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(100);

    // Clear logs before Alt+S
    logs.length = 0;

    // Press Alt+S
    console.log('\n=== Pressing Alt+S ===');
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(200);

    // Check logs for API calls
    const hasApplySlur = logs.some(log =>
      log.includes('applySlur called') && !log.includes('Layered')
    );
    const hasApplySlurLayered = logs.some(log =>
      log.includes('applySlurLayered') || log.includes('Layered')
    );

    console.log('\n=== Log Analysis ===');
    console.log('Found OLD applySlur call:', hasApplySlur);
    console.log('Found NEW applySlurLayered call:', hasApplySlurLayered);

    // Print all logs that mention slur
    console.log('\n=== All slur-related logs ===');
    logs.filter(log => log.toLowerCase().includes('slur')).forEach(log => {
      console.log('  ', log);
    });

    // Check annotation layer
    const slurs = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });

    console.log('\n=== Annotation Layer ===');
    console.log('Slurs in annotation layer:', JSON.stringify(slurs, null, 2));

    // ASSERTIONS
    expect(hasApplySlur).toBe(false); // Should NOT call old API
    expect(hasApplySlurLayered).toBe(true); // SHOULD call new layered API
    expect(slurs).toBeTruthy();
    expect(slurs.length).toBeGreaterThan(0); // Slur should be in annotation layer
  });

  test('Shift+Alt+S uses removeSlurLayered (NOT removeSlur)', async ({ page }) => {
    const logs = [];
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      console.log('[BROWSER]', text);
    });

    // Type notation and select it
    await page.keyboard.type('12');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    // Apply slur first
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(100);

    // Verify slur exists
    let slurs = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });
    console.log('Slurs after Alt+S:', slurs.length);
    expect(slurs.length).toBe(1);

    // Clear logs before Shift+Alt+S
    logs.length = 0;

    // Press Shift+Alt+S to remove
    console.log('\n=== Pressing Shift+Alt+S ===');
    await page.keyboard.press('Shift+Alt+s');
    await page.waitForTimeout(200);

    // Check logs for API calls
    const hasRemoveSlur = logs.some(log =>
      log.includes('removeSlur called') && !log.includes('Layered')
    );
    const hasRemoveSlurLayered = logs.some(log =>
      log.includes('removeSlurLayered') || log.includes('Layered')
    );

    console.log('\n=== Log Analysis ===');
    console.log('Found OLD removeSlur call:', hasRemoveSlur);
    console.log('Found NEW removeSlurLayered call:', hasRemoveSlurLayered);

    // Print all logs that mention slur
    console.log('\n=== All slur-related logs ===');
    logs.filter(log => log.toLowerCase().includes('slur')).forEach(log => {
      console.log('  ', log);
    });

    // Check annotation layer
    slurs = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });

    console.log('\n=== Annotation Layer ===');
    console.log('Slurs after removal:', JSON.stringify(slurs, null, 2));

    // ASSERTIONS
    expect(hasRemoveSlur).toBe(false); // Should NOT call old API
    expect(hasRemoveSlurLayered).toBe(true); // SHOULD call new layered API
    expect(slurs.length).toBe(0); // Slur should be removed from annotation layer
  });

  test('Multiple Alt+S presses toggle slur in annotation layer', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    // Type and select
    await page.keyboard.type('12');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    // Toggle slur 5 times, checking annotation layer each time
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Alt+s');
      await page.waitForTimeout(100);

      const slurs = await page.evaluate(() => {
        return window.editor?.wasmModule?.getSlursForLine?.(0);
      });

      const expectedCount = i % 2 === 0 ? 1 : 0;
      console.log(`Toggle ${i + 1}: ${slurs.length} slurs (expected: ${expectedCount})`);
      expect(slurs.length).toBe(expectedCount);
    }

    // Count how many times layered API was called
    const layeredApiCalls = logs.filter(log =>
      log.includes('applySlurLayered') || log.includes('removeSlurLayered')
    ).length;

    console.log(`\nTotal layered API calls: ${layeredApiCalls}`);
    expect(layeredApiCalls).toBeGreaterThan(0);
  });

  test('Alt+S on empty line does not crash', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    page.on('pageerror', err => {
      console.log('[PAGE ERROR]', err.message);
      throw new Error(`Page error: ${err.message}`);
    });

    // Don't type anything, just press Alt+S
    await page.keyboard.press('Alt+s');
    await page.waitForTimeout(200);

    // Should not crash
    const slurs = await page.evaluate(() => {
      return window.editor?.wasmModule?.getSlursForLine?.(0);
    });

    expect(slurs.length).toBe(0);
    console.log('Alt+S on empty line handled gracefully');
  });
});
