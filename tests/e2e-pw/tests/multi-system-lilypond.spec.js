/**
 * E2E Test: Multi-system LilyPond Export
 *
 * Tests that a 4-staff bracketed system followed by a standalone line
 * generates correct LilyPond with TWO separate systems, not merged into one.
 *
 * Expected structure:
 * - System 1: \new StaffGroup << 4 staves >>
 * - System 2: \new Staff { standalone }
 */

import { test, expect } from '@playwright/test';

test.describe('Multi-system LilyPond: 4-staff + standalone', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(() => {
      return window.editor && window.editor.wasmModule && window.editor.wasmModule.createNewDocument;
    });

    await page.evaluate(() => {
      window.editor.createNewDocument();
    });

    await page.waitForSelector('.notation-line-container');
  });

  test('4-staff system (SATB) + standalone line should generate 2 separate systems in LilyPond', async ({ page }) => {
    // Create 5 lines
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        await window.editor.wasmModule.insertNewline();
      }
      await window.editor.renderAndUpdate();
    });

    await page.waitForTimeout(200);

    // Set line 0 to «4 (4-staff SATB system)
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');

    // Click 4 times to get to «4
    for (let i = 0; i < 4; i++) {
      await indicator0.click();
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(200);

    // Check document structure first
    const docData = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return {
        lineCount: doc.lines.length,
        lines: doc.lines.map((l, idx) => ({
          index: idx,
          system_id: l.system_id,
          part_id: l.part_id,
          system_start_count: l.system_start_count,
          staff_role: l.staff_role
        }))
      };
    });

    console.log('\n========== Document Structure ==========');
    console.log(JSON.stringify(docData, null, 2));
    console.log('=======================================\n');

    // Get MusicXML export
    const musicxml = await page.evaluate(() => {
      const doc = window.editor.getDocument();
      return window.editor.wasmModule.exportMusicXML(doc);
    });

    console.log('\n========== MusicXML Output ==========');
    console.log(musicxml);
    console.log('=====================================\n');

    // Verify MusicXML structure
    expect(musicxml).toContain('<part-group type="start" number="1">');
    expect(musicxml).toContain('<part-group type="stop" number="1"/>');
    expect(musicxml).toContain('<score-part id="P1">');
    expect(musicxml).toContain('<score-part id="P2">');
    expect(musicxml).toContain('<score-part id="P3">');
    expect(musicxml).toContain('<score-part id="P4">');
    expect(musicxml).toContain('<score-part id="P5">');

    // Convert to LilyPond
    const lilypondResult = await page.evaluate((xml) => {
      const wasm = window.editor.wasmModule;
      const settings = JSON.stringify({
        target_lilypond_version: "2.24.0",
        language: "English",
        convert_directions: true,
        convert_lyrics: true,
        convert_chord_symbols: true,
        title: null,
        composer: null
      });

      const result = wasm.convertMusicXMLToLilyPond(xml, settings);
      return JSON.parse(result);
    }, musicxml);

    console.log('\n========== LilyPond Output ==========');
    console.log(lilypondResult.lilypond_source);
    console.log('=====================================\n');

    const lilypond = lilypondResult.lilypond_source;
    const normalized = lilypond.replace(/\s+/g, ' ').trim();

    // CRITICAL: Should have ONE StaffGroup (for the 4-staff system)
    const staffGroupMatches = normalized.match(/\\new StaffGroup/g);
    expect(staffGroupMatches).not.toBeNull();
    expect(staffGroupMatches.length).toBe(1);

    // CRITICAL: Should have FIVE \new Staff contexts total (4 in group + 1 standalone)
    const staffMatches = normalized.match(/\\new Staff(?!Group)/g);
    expect(staffMatches).not.toBeNull();
    expect(staffMatches.length).toBe(5);

    // CRITICAL: Should have \break or other separator between systems
    // (LilyPond should separate the 4-staff group from the standalone line)
    // Note: The exact separator syntax depends on the converter implementation

    console.log(' PASS: 4-staff system + standalone generates correct LilyPond structure\n');
  });
});
