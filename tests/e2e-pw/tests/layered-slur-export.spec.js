import { test, expect } from '@playwright/test';

/**
 * E2E Test for Layered Slur Export to MusicXML/LilyPond
 *
 * Tests that slurs created with the layered architecture API
 * are properly exported to MusicXML and LilyPond.
 */

test.describe('Layered Slur Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Wait for editor to be ready
    const editor = page.locator('#notation-editor');
    await expect(editor).toBeVisible();

    // Wait for WASM to be loaded
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule;
    }, { timeout: 10000 });
  });

  test('slurs export to LilyPond correctly', async ({ page }) => {
    // Enable console logging
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    // Type some musical notation
    await page.keyboard.type('1 2 3 4');

    // Apply a slur using layered API (columns 0-3: "1 2")
    const applyResult = await page.evaluate(() => {
      return window.editor.wasmModule.applySlurLayered(0, 0, 3);
    });

    console.log('Apply slur result:', applyResult);
    expect(applyResult.success).toBe(true);
    expect(applyResult.slur_count).toBe(1);

    // Switch to LilyPond tab and get source
    await page.click('[data-testid="tab-lilypond"]');

    // Wait for LilyPond source to be generated
    await page.waitForTimeout(500);

    const lilypondSource = await page.locator('#lilypond-source').innerText();
    console.log('LilyPond source:', lilypondSource);

    // Verify slur is present in LilyPond source
    // LilyPond slurs are notated as ( and )
    expect(lilypondSource).toContain('(');
    expect(lilypondSource).toContain(')');

    // Check that console log confirms slurs were applied
    const slurAppliedLog = logs.find(log => log.includes('Applied') && log.includes('slurs'));
    expect(slurAppliedLog).toBeTruthy();
  });

  test('slurs export to MusicXML correctly', async ({ page }) => {
    // Type some musical notation
    await page.keyboard.type('1 2 3 4');

    // Apply a slur
    await page.evaluate(() => {
      return window.editor.wasmModule.applySlurLayered(0, 0, 3);
    });

    // Switch to MusicXML tab and get source
    await page.click('[data-testid="tab-musicxml"]');

    // Wait for MusicXML source to be generated
    await page.waitForTimeout(500);

    const musicxmlSource = await page.locator('#musicxml-source').innerText();
    console.log('MusicXML source (excerpt):', musicxmlSource.substring(0, 500));

    // Verify slur is present in MusicXML
    // MusicXML slurs are notated with <slur type="start"/> and <slur type="stop"/>
    expect(musicxmlSource).toContain('<slur');
    expect(musicxmlSource).toMatch(/type="start"/);
    expect(musicxmlSource).toMatch(/type="stop"/);
  });

  test('multiple slurs export correctly', async ({ page }) => {
    // Type longer notation
    await page.keyboard.type('1 2 3 4 5 6');

    // Apply two slurs
    await page.evaluate(() => {
      window.editor.wasmModule.applySlurLayered(0, 0, 3);  // "1 2"
      window.editor.wasmModule.applySlurLayered(0, 4, 7);  // "3 4"
    });

    // Get LilyPond source
    await page.click('[data-testid="tab-lilypond"]');
    await page.waitForTimeout(500);

    const lilypondSource = await page.locator('#lilypond-source').innerText();

    // Count slur markers ( and )
    const openSlurs = (lilypondSource.match(/\(/g) || []).length;
    const closeSlurs = (lilypondSource.match(/\)/g) || []).length;

    console.log(`Found ${openSlurs} open slurs and ${closeSlurs} close slurs`);

    // We expect 2 slurs, so 2 open and 2 close markers
    expect(openSlurs).toBe(2);
    expect(closeSlurs).toBe(2);
  });

  test('slur removal reflects in export', async ({ page }) => {
    // Capture console logs
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[removeSlurLayered]') ||
          text.includes('[applyAnnotationSlursToCells]') ||
          text.includes('[ExportManager]') ||
          text.includes('[UI]') ||
          text.includes('[Editor]')) {
        consoleLogs.push(text);
      }
    });

    // Type notation
    await page.keyboard.type('1 2 3 4');

    // Apply a slur
    const applyResult = await page.evaluate(() => {
      return window.editor.wasmModule.applySlurLayered(0, 0, 3);
    });
    console.log('Apply slur result:', applyResult);

    // Verify slur is exported
    await page.click('[data-testid="tab-lilypond"]');
    await page.waitForTimeout(500);
    let lilypondSource = await page.locator('#lilypond-source').innerText();
    expect(lilypondSource).toContain('(');

    // Remove the slur
    const removeResult = await page.evaluate(() => {
      return window.editor.wasmModule.removeSlurLayered(0, 0, 3);
    });
    console.log('Remove slur result:', removeResult);

    // Refresh LilyPond tab by clicking away and back
    await page.click('[data-testid="tab-docmodel"]');
    await page.waitForTimeout(100);
    await page.click('[data-testid="tab-lilypond"]');
    await page.waitForTimeout(500);

    lilypondSource = await page.locator('#lilypond-source').innerText();

    // Print console logs for debugging
    console.log('\n=== Console logs from browser ===');
    consoleLogs.forEach(log => console.log(log));
    console.log('=================================\n');

    // Slur should be removed
    const slurMarkers = (lilypondSource.match(/\(/g) || []).length;
    expect(slurMarkers).toBe(0);
  });
});
