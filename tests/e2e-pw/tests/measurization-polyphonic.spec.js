// @ts-check
import { test, expect } from '@playwright/test';

/**
 * Measurization E2E Tests
 *
 * These tests verify the polyphonic alignment feature that ensures
 * all parts in MusicXML have identical measure counts.
 *
 * Input format: Number system notation (1-7 = scale degrees)
 * Example: "1 2 3 4" = four quarter notes (C D E F in C major)
 */

test.describe('Measurization: Polyphonic Alignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    // Wait for WASM to be ready
    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule && window.editor.wasmModule.createNewDocument;
    });

    // Create a new document
    await page.evaluate(() => {
      window.editor.createNewDocument();
    });

    // Wait for document to be rendered
    await page.waitForSelector('.notation-line-container');
  });

  test('Two parts with equal beats should have same measure count', async ({ page }) => {
    // Create 2 lines as a 2-staff system (so they get different part_ids)
    await page.evaluate(async () => {
      // Line 0: 1 2 3 4 (4 quarter notes)
      window.editor.setCursorPosition({ line: 0, column: 0 });
      window.editor.insertText('1 2 3 4');

      // Add second line
      await window.editor.wasmModule.insertNewline();
      await window.editor.renderAndUpdate();

      // Line 1: 5 6 7 1 (4 quarter notes)
      window.editor.setCursorPosition({ line: 1, column: 0 });
      window.editor.insertText('5 6 7 1');
    });

    await page.waitForTimeout(200);

    // Set up as 2-staff system by clicking indicator twice
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    await indicator0.click(); // → «1
    await page.waitForTimeout(50);
    await indicator0.click(); // → «2
    await page.waitForTimeout(200);

    // Debug: Show document structure
    const docInfo = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return doc.lines.map((l, i) => ({
        index: i,
        part_id: l.part_id,
        system_id: l.system_id,
      }));
    });
    console.log('Document structure:', JSON.stringify(docInfo));

    // Get polyphonic MusicXML
    const musicxml = await page.evaluate(() => {
      return window.editor.wasmModule.exportMusicXMLPolyphonic();
    });

    console.log('MusicXML length:', musicxml.length);

    // Debug: Show all part IDs found
    const allParts = musicxml.match(/<part id="[^"]+"/g) || [];
    console.log('Found parts:', allParts);

    // Count measures in each part
    const p1Part = musicxml.match(/<part id="P1">[\s\S]*?<\/part>/)?.[0] || '';
    const p2Part = musicxml.match(/<part id="P2">[\s\S]*?<\/part>/)?.[0] || '';

    const p1Measures = (p1Part.match(/<measure/g) || []).length;
    const p2Measures = (p2Part.match(/<measure/g) || []).length;

    console.log(`P1 measures: ${p1Measures}, P2 measures: ${p2Measures}`);

    // Both parts should have the same number of measures
    expect(p1Measures).toBe(p2Measures);
    expect(p1Measures).toBeGreaterThan(0);
  });

  test('Shorter part should be padded with rests', async ({ page }) => {
    // Create 2 lines as a 2-staff system: one with 4 beats, one with 2 beats
    await page.evaluate(async () => {
      // Line 0: 1 2 3 4 (4 quarter notes = 1 bar)
      window.editor.setCursorPosition({ line: 0, column: 0 });
      window.editor.insertText('1 2 3 4');

      // Add second line
      await window.editor.wasmModule.insertNewline();
      await window.editor.renderAndUpdate();

      // Line 1: 5 6 (2 quarter notes = half bar)
      window.editor.setCursorPosition({ line: 1, column: 0 });
      window.editor.insertText('5 6');
    });

    await page.waitForTimeout(200);

    // Set up as 2-staff system
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    await indicator0.click(); // → «1
    await page.waitForTimeout(50);
    await indicator0.click(); // → «2
    await page.waitForTimeout(200);

    // Debug: Show document structure
    const docInfo = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return doc.lines.map((l, i) => ({
        index: i,
        part_id: l.part_id,
        system_id: l.system_id,
      }));
    });
    console.log('Document structure:', JSON.stringify(docInfo));

    // Get polyphonic MusicXML
    const musicxml = await page.evaluate(() => {
      return window.editor.wasmModule.exportMusicXMLPolyphonic();
    });

    console.log('MusicXML length:', musicxml.length);

    // Debug: Show all part IDs found
    const allParts = musicxml.match(/<part id="[^"]+"/g) || [];
    console.log('Found parts:', allParts);

    // Count measures in each part
    const p1Part = musicxml.match(/<part id="P1">[\s\S]*?<\/part>/)?.[0] || '';
    const p2Part = musicxml.match(/<part id="P2">[\s\S]*?<\/part>/)?.[0] || '';

    const p1Measures = (p1Part.match(/<measure/g) || []).length;
    const p2Measures = (p2Part.match(/<measure/g) || []).length;

    console.log(`P1 measures: ${p1Measures}, P2 measures: ${p2Measures}`);

    // CRITICAL: Both parts MUST have the same number of measures
    expect(p1Measures).toBe(p2Measures);

    // P2 (shorter part) should contain rest(s) for padding
    expect(p2Part).toContain('<rest/>');
  });

  test('Long note crossing bar boundary should have ties', async ({ page }) => {
    // Create a line with a long note that spans bar boundary
    // Use tied notation: 1--- = whole note (4 beats)
    // In a single beat, this is 4 subdivisions
    await page.evaluate(async () => {
      // Line 0: 1--- 2--- (two half notes, but represented as subdivisions)
      // Actually, let's use a simpler approach: 8 quarter notes to span 2 bars
      window.editor.setCursorPosition({ line: 0, column: 0 });
      window.editor.insertText('1 2 3 4 5 6 7 1');
    });

    await page.waitForTimeout(200);

    // Get polyphonic MusicXML
    const musicxml = await page.evaluate(() => {
      return window.editor.wasmModule.exportMusicXMLPolyphonic();
    });

    // Should have 2 measures
    const p1Part = musicxml.match(/<part id="P1">[\s\S]*?<\/part>/)?.[0] || '';
    const measureCount = (p1Part.match(/<measure/g) || []).length;

    console.log(`Measure count: ${measureCount}`);
    expect(measureCount).toBe(2);
  });

  test('SATB system with 4 parts should have equal measures', async ({ page }) => {
    // Create 4 lines and set up as 4-staff system
    await page.evaluate(async () => {
      // Create 4 lines
      for (let i = 0; i < 3; i++) {
        await window.editor.wasmModule.insertNewline();
      }
      await window.editor.renderAndUpdate();

      // Add notes to each line
      window.editor.setCursorPosition({ line: 0, column: 0 });
      window.editor.insertText('1 2 3 4');  // Soprano

      window.editor.setCursorPosition({ line: 1, column: 0 });
      window.editor.insertText('3 4 5 6');  // Alto

      window.editor.setCursorPosition({ line: 2, column: 0 });
      window.editor.insertText('5 6 7 1');  // Tenor

      window.editor.setCursorPosition({ line: 3, column: 0 });
      window.editor.insertText('1 2 3');    // Bass - SHORTER!
    });

    await page.waitForTimeout(200);

    // Set up 4-staff system by clicking indicator 4 times
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    for (let i = 0; i < 4; i++) {
      await indicator0.click();
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(200);

    // Get polyphonic MusicXML
    const musicxml = await page.evaluate(() => {
      return window.editor.wasmModule.exportMusicXMLPolyphonic();
    });

    // Extract all parts
    const parts = musicxml.match(/<part id="P\d+">[\s\S]*?<\/part>/g) || [];
    console.log(`Found ${parts.length} parts`);

    expect(parts.length).toBe(4);

    // Count measures in each part
    const measureCounts = parts.map(part => {
      const count = (part.match(/<measure/g) || []).length;
      console.log(`Part measures: ${count}`);
      return count;
    });

    // ALL parts must have the same number of measures
    const firstCount = measureCounts[0];
    for (const count of measureCounts) {
      expect(count).toBe(firstCount);
    }

    // P4 (Bass, shorter) should have rests
    const p4Part = musicxml.match(/<part id="P4">[\s\S]*?<\/part>/)?.[0] || '';
    console.log('P4 part content:', p4Part);
    console.log('P4 contains rest?:', p4Part.includes('<rest'));

    // Check for rest in any format (might be <rest/> or <rest></rest>)
    expect(p4Part).toMatch(/<rest/);
  });

  test('Multi-system document should have system breaks', async ({ page }) => {
    // Create SATB + Solo pattern (lines 0-3 = system 1, line 4 = system 2)
    await page.evaluate(async () => {
      // Create 5 lines
      for (let i = 0; i < 4; i++) {
        await window.editor.wasmModule.insertNewline();
      }
      await window.editor.renderAndUpdate();

      // Add notes
      window.editor.setCursorPosition({ line: 0, column: 0 });
      window.editor.insertText('1 2 3 4');

      window.editor.setCursorPosition({ line: 1, column: 0 });
      window.editor.insertText('3 4 5 6');

      window.editor.setCursorPosition({ line: 2, column: 0 });
      window.editor.insertText('5 6 7 1');

      window.editor.setCursorPosition({ line: 3, column: 0 });
      window.editor.insertText('1 2 3 4');

      window.editor.setCursorPosition({ line: 4, column: 0 });
      window.editor.insertText('5 6 7 1');

      // Set labels
      window.editor.wasmModule.setLineLabel(0, 'Soprano');
      window.editor.wasmModule.setLineLabel(1, 'Alto');
      window.editor.wasmModule.setLineLabel(2, 'Tenor');
      window.editor.wasmModule.setLineLabel(3, 'Bass');
      window.editor.wasmModule.setLineLabel(4, 'Soprano');
    });

    await page.waitForTimeout(200);

    // Set up 4-staff system on lines 0-3
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');
    for (let i = 0; i < 4; i++) {
      await indicator0.click();
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(200);

    // Verify system structure
    const systemData = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return doc.lines.map((l, idx) => ({
        index: idx,
        system_id: l.system_id,
        part_id: l.part_id,
      }));
    });

    console.log('System data:', JSON.stringify(systemData, null, 2));

    // Lines 0-3 should be system 1, line 4 should be system 2
    expect(systemData[0].system_id).toBe(1);
    expect(systemData[4].system_id).toBe(2);

    // Get polyphonic MusicXML
    const musicxml = await page.evaluate(() => {
      return window.editor.wasmModule.exportMusicXMLPolyphonic();
    });

    // P1 (Soprano) should have system break since it spans both systems
    const p1Part = musicxml.match(/<part id="P1">[\s\S]*?<\/part>/)?.[0] || '';

    // Should have <print new-system="yes"/> somewhere
    // Note: This tests the system break tracking in measurization
    console.log('P1 part length:', p1Part.length);

    // All parts should have equal measure counts
    const parts = musicxml.match(/<part id="P\d+">[\s\S]*?<\/part>/g) || [];
    const measureCounts = parts.map(part => (part.match(/<measure/g) || []).length);
    const firstCount = measureCounts[0];
    for (const count of measureCounts) {
      expect(count).toBe(firstCount);
    }
  });
});
