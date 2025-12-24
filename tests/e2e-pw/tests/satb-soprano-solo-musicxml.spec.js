// @ts-check
import { test, expect } from '@playwright/test';

test.describe('SATB + Soprano Solo MusicXML Export', () => {
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

  test('should export SATB + Soprano solo with correct MusicXML structure', async ({ page }) => {
    // Create 5 lines: 4-staff SATB system + standalone Soprano
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        await window.editor.wasmModule.insertNewline();
      }
      await window.editor.renderAndUpdate();
    });

    await page.waitForTimeout(200);

    // Set labels for SATB
    await page.evaluate(() => {
      window.editor.wasmModule.setLineLabel(0, 'Soprano');
      window.editor.wasmModule.setLineLabel(1, 'Alto');
      window.editor.wasmModule.setLineLabel(2, 'Tenor');
      window.editor.wasmModule.setLineLabel(3, 'Bass');
      window.editor.wasmModule.setLineLabel(4, 'Soprano'); // Same voice continuing
    });

    // Add some notes to each line
    await page.evaluate(() => {
      // Line 0 (Soprano in SATB): C D E F
      window.editor.setCursorPosition({ line: 0, column: 0 });
      window.editor.insertText('1 2 3 4');

      // Line 1 (Alto): E F G A
      window.editor.setCursorPosition({ line: 1, column: 0 });
      window.editor.insertText('3 4 5 6');

      // Line 2 (Tenor): G A B C
      window.editor.setCursorPosition({ line: 2, column: 0 });
      window.editor.insertText('5 6 7 1');

      // Line 3 (Bass): C D E F
      window.editor.setCursorPosition({ line: 3, column: 0 });
      window.editor.insertText('1 2 3 4');

      // Line 4 (Soprano solo): G A B C
      window.editor.setCursorPosition({ line: 4, column: 0 });
      window.editor.insertText('5 6 7 1');
    });

    // Set up 4-staff system (lines 0-3)
    const indicator0 = page.locator('.system-marker-indicator[data-line-index="0"]');

    // Click 4 times to get «4
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
        label: l.label
      }));
    });

    console.log('System data:', systemData);

    // Verify part IDs
    expect(systemData[0].part_id).toBe('P1'); // Soprano in SATB
    expect(systemData[1].part_id).toBe('P2'); // Alto
    expect(systemData[2].part_id).toBe('P3'); // Tenor
    expect(systemData[3].part_id).toBe('P4'); // Bass
    expect(systemData[4].part_id).toBe('P1'); // Soprano solo (reuses P1!)

    // Verify system IDs
    expect(systemData[0].system_id).toBe(1);
    expect(systemData[1].system_id).toBe(1);
    expect(systemData[2].system_id).toBe(1);
    expect(systemData[3].system_id).toBe(1);
    expect(systemData[4].system_id).toBe(2);

    // Get MusicXML from inspector tab
    const musicxmlTab = page.getByTestId('tab-musicxml');
    await expect(musicxmlTab).toBeVisible();
    await musicxmlTab.click();

    // Wait for MusicXML to render
    await page.waitForTimeout(500);

    // Get MusicXML content
    const musicxmlPane = page.getByTestId('pane-musicxml');
    const musicxml = await musicxmlPane.innerText();

    console.log('MusicXML output length:', musicxml.length);

    // Verify part-list structure
    expect(musicxml).toContain('<part-list>');

    // Should have part-group for SATB (4 staves)
    expect(musicxml).toContain('<part-group type="start" number="1">');
    expect(musicxml).toContain('<group-symbol>bracket</group-symbol>');
    expect(musicxml).toContain('<part-group type="stop" number="1"/>');

    // Should have score-part entries for P1, P2, P3, P4
    expect(musicxml).toContain('<score-part id="P1">');
    expect(musicxml).toContain('<part-name>Soprano</part-name>');
    expect(musicxml).toContain('<score-part id="P2">');
    expect(musicxml).toContain('<part-name>Alto</part-name>');
    expect(musicxml).toContain('<score-part id="P3">');
    expect(musicxml).toContain('<part-name>Tenor</part-name>');
    expect(musicxml).toContain('<score-part id="P4">');
    expect(musicxml).toContain('<part-name>Bass</part-name>');

    // Should NOT have duplicate P1 entry in part-list
    const partListSection = musicxml.match(/<part-list>[\s\S]*?<\/part-list>/)?.[0] || '';
    const p1Occurrences = (partListSection.match(/<score-part id="P1">/g) || []).length;
    expect(p1Occurrences).toBe(1); // Only ONE <score-part id="P1"> in part-list

    // Verify P1 part contains measures from both systems
    const p1PartSection = musicxml.match(/<part id="P1">[\s\S]*?<\/part>/)?.[0] || '';

    // Should have <print new-system="yes"/> when transitioning from system 1 to system 2
    expect(p1PartSection).toContain('<print new-system="yes"/>');

    // Count measures in P1 (should have measures from both line 0 and line 4)
    const measureCount = (p1PartSection.match(/<measure/g) || []).length;
    console.log('P1 measure count:', measureCount);
    expect(measureCount).toBeGreaterThanOrEqual(2); // At least 2 measures (one from each line)

    // Verify P2, P3, P4 parts exist
    expect(musicxml).toContain('<part id="P2">');
    expect(musicxml).toContain('<part id="P3">');
    expect(musicxml).toContain('<part id="P4">');

    console.log('✓ MusicXML structure verified');
  });
});
