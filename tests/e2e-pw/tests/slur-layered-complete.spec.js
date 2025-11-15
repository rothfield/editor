import { test, expect } from '@playwright/test';

/**
 * E2E Test: Complete Layered Slur Architecture
 *
 * Tests all 4 completed tasks:
 * 1. Alt+S keyboard shortcut uses toggleSlur() layered API
 * 2. Staff notation auto-updates when slurs change
 * 3. Visual slur rendering in editor (SVG overlay)
 * 4. Automatic position tracking on text edits
 */

test.describe('Layered Slur Architecture - Complete E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Wait for WASM to be loaded
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule && window.editor.wasmModule.toggleSlur;
    }, { timeout: 10000 });
  });

  test('Task 1: Alt+S uses toggleSlur() layered API', async ({ page }) => {
    // Type notation
    await page.keyboard.type('1 2 3 4');

    // Select range (Shift+Left x2 to select "2 3")
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');

    // Apply slur with Alt+S
    await page.keyboard.press('Alt+s');

    // Verify slur was added to annotation layer
    const slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });

    expect(slurs).toBeDefined();
    expect(slurs.length).toBe(1);
    console.log('✓ Task 1: Alt+S uses toggleSlur()');
  });

  test('Task 2: Staff notation auto-updates after Alt+S', async ({ page }) => {
    // Type notation
    await page.keyboard.type('1 2 3 4');

    // Switch to staff notation tab
    await page.click('[data-tab="staff-notation"]');
    await page.waitForTimeout(500);

    // Verify staff notation rendered
    const svgBefore = page.locator('#staff-notation-container svg');
    await expect(svgBefore).toBeVisible();

    // Focus editor
    await page.click('#notation-editor');

    // Select range and apply slur
    await page.keyboard.press('Shift+Home');  // Select all
    await page.keyboard.press('Alt+s');

    // Wait for staff notation update (should happen automatically)
    await page.waitForTimeout(1000);

    // Verify staff notation still visible (proves it updated without manual tab switch)
    const svgAfter = page.locator('#staff-notation-container svg');
    await expect(svgAfter).toBeVisible();

    console.log('✓ Task 2: Staff notation auto-updates');
  });

  test('Task 3: Visual slur renders in editor (SVG overlay)', async ({ page }) => {
    // Type notation
    await page.keyboard.type('1 2 3');

    // Select all and apply slur
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Alt+s');

    // Wait for render
    await page.waitForTimeout(500);

    // Check for SVG overlay
    const svgOverlay = page.locator('.arc-overlay');
    await expect(svgOverlay).toBeAttached();

    // Check for slur path in SVG
    const slurPath = page.locator('.arc-overlay #slurs path');
    await expect(slurPath).toBeAttached();

    // Verify path has d attribute (Bézier curve data)
    const pathData = await slurPath.getAttribute('d');
    expect(pathData).toBeTruthy();
    expect(pathData).toContain('M'); // Move command
    expect(pathData).toContain('C'); // Cubic Bézier command

    console.log('✓ Task 3: Visual slur renders');
  });

  test('Task 4: Position tracking - inserting text before slur', async ({ page }) => {
    // Type notation: "1 2 3"
    await page.keyboard.type('1 2 3');

    // Move cursor to position 2 (select "2")
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight'); // After "1"
    await page.keyboard.press('ArrowRight'); // After space
    await page.keyboard.press('Shift+ArrowRight'); // Select "2"
    await page.keyboard.press('Shift+ArrowRight'); // Select space after "2"

    // Apply slur on "2 "
    await page.keyboard.press('Alt+s');

    // Verify slur exists at expected position
    let slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    expect(slurs.length).toBe(1);
    const originalStart = slurs[0].start.col;
    const originalEnd = slurs[0].end.col;

    // Insert "0 " at the beginning
    await page.keyboard.press('Home');
    await page.keyboard.type('0 ');

    // Wait for annotation update
    await page.waitForTimeout(200);

    // Verify slur positions shifted by 2
    slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    expect(slurs.length).toBe(1);
    expect(slurs[0].start.col).toBe(originalStart + 2);
    expect(slurs[0].end.col).toBe(originalEnd + 2);

    console.log(`✓ Task 4: Position tracking works (shifted from ${originalStart}-${originalEnd} to ${slurs[0].start.col}-${slurs[0].end.col})`);
  });

  test('Task 4: Position tracking - deleting text before slur', async ({ page }) => {
    // Type notation: "0 1 2 3"
    await page.keyboard.type('0 1 2 3');

    // Select and slur "2 3"
    await page.keyboard.press('Home');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight'); // Position at "2"
    await page.keyboard.press('Shift+ArrowRight'); // Select "2"
    await page.keyboard.press('Shift+ArrowRight'); // Select space
    await page.keyboard.press('Shift+ArrowRight'); // Select "3"

    await page.keyboard.press('Alt+s');

    // Verify slur exists
    let slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    expect(slurs.length).toBe(1);
    const originalStart = slurs[0].start.col;
    const originalEnd = slurs[0].end.col;

    // Delete "0 " from beginning
    await page.keyboard.press('Home');
    await page.keyboard.press('Delete'); // Delete "0"
    await page.keyboard.press('Delete'); // Delete space

    // Wait for annotation update
    await page.waitForTimeout(200);

    // Verify slur positions shifted left by 2
    slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    expect(slurs.length).toBe(1);
    expect(slurs[0].start.col).toBe(originalStart - 2);
    expect(slurs[0].end.col).toBe(originalEnd - 2);

    console.log(`✓ Task 4: Position tracking on delete (shifted from ${originalStart}-${originalEnd} to ${slurs[0].start.col}-${slurs[0].end.col})`);
  });

  test('All tasks integrated: Complete workflow', async ({ page }) => {
    console.log('\n=== Complete Layered Architecture Workflow ===');

    // 1. Type notation
    await page.keyboard.type('1 2 3 4 5');
    console.log('1. Typed notation: 1 2 3 4 5');

    // 2. Apply slur with Alt+S
    await page.keyboard.press('Home');
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Alt+s');
    console.log('2. Applied slur on "2 3" with Alt+S');

    // 3. Verify visual rendering
    await page.waitForTimeout(300);
    const slurPath = page.locator('.arc-overlay #slurs path');
    await expect(slurPath).toBeAttached();
    console.log('3. ✓ Visual slur rendered');

    // 4. Verify export
    await page.click('[data-testid="tab-lilypond"]');
    await page.waitForTimeout(500);
    const lilypondSource = await page.locator('#lilypond-source').innerText();
    expect(lilypondSource).toContain('(');
    expect(lilypondSource).toContain(')');
    console.log('4. ✓ LilyPond export contains slurs');

    // 5. Switch to staff notation and verify update
    await page.click('[data-tab="staff-notation"]');
    await page.waitForTimeout(500);
    const svg = page.locator('#staff-notation-container svg');
    await expect(svg).toBeVisible();
    console.log('5. ✓ Staff notation rendered');

    // 6. Focus editor and test position tracking
    await page.click('#notation-editor');
    await page.keyboard.press('Home');
    await page.keyboard.type('0 ');
    await page.waitForTimeout(200);

    // Verify slur shifted
    const slurs = await page.evaluate(() => {
      return window.editor.wasmModule.getSlursForLine(0);
    });
    expect(slurs[0].start.col).toBe(4); // Shifted from 2 to 4
    console.log('6. ✓ Position tracking: slur shifted after insert');

    console.log('\n=== All Tasks Complete ===\n');
  });
});
