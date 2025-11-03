/**
 * E2E Test: Multi-staff LilyPond Export - No Duplicate Time Signatures
 *
 * Verifies the fix in src/converters/musicxml/musicxml_to_lilypond/lilypond.rs
 * that prevents \time, \key, and \clef from being duplicated in multi-staff scores.
 *
 * Per CLAUDE.md: Inspector-first testing with LilyPond as primary oracle
 */

import { test, expect } from '@playwright/test';

// Helper: Wait for app and WASM to be ready
async function waitForWASM(page) {
  await page.waitForFunction(() => {
    const app = window.MusicNotationApp?.app();
    return app?.editor?.wasmModule?.convertMusicXMLToLilyPond !== undefined;
  }, { timeout: 10000 });
}

// Helper: Convert MusicXML to LilyPond
async function convertToLilyPond(page, musicxml) {
  return await page.evaluate((xml) => {
    const app = window.MusicNotationApp.app();
    const wasm = app.editor.wasmModule;

    try {
      const jsonResult = wasm.convertMusicXMLToLilyPond(xml, null);
      const parsed = JSON.parse(jsonResult);
      return { success: true, lilypond: parsed.lilypond_source };
    } catch (error) {
      return { success: false, error: error.toString() };
    }
  }, musicxml);
}

test.describe('Multi-staff LilyPond Export - No Duplicate Attributes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForWASM(page);
  });

  test('2-staff score: \\time appears only once', async ({ page }) => {
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Treble</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>3</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const result = await convertToLilyPond(page, musicxml);

    expect(result.success).toBe(true);
    const lilypond = result.lilypond;

    console.log('\n========== 2-Staff LilyPond Output ==========');
    console.log(lilypond);
    console.log('==========================================\n');

    // Count directives
    const timeMatches = lilypond.match(/\\time\s+\d+\/\d+/g) || [];
    const staffMatches = lilypond.match(/\\new\s+Staff/g) || [];
    const keyMatches = lilypond.match(/\\key\s+\w+\s+\\(major|minor)/g) || [];

    console.log(`✓ Found ${staffMatches.length} \\new Staff`);
    console.log(`✓ Found ${timeMatches.length} \\time: ${timeMatches.join(', ')}`);
    console.log(`✓ Found ${keyMatches.length} \\key: ${keyMatches.join(', ')}`);

    // CRITICAL ASSERTIONS
    expect(staffMatches.length).toBe(2);
    expect(timeMatches.length).toBe(1);  // Only in first staff
    expect(keyMatches.length).toBe(1);   // Only in first staff

    // Verify \time is in first staff, not second
    const firstStaffStart = lilypond.indexOf('\\new Staff');
    const secondStaffStart = lilypond.indexOf('\\new Staff', firstStaffStart + 1);
    const timePosition = lilypond.indexOf('\\time');

    expect(timePosition).toBeGreaterThan(firstStaffStart);
    expect(timePosition).toBeLessThan(secondStaffStart);

    console.log('✅ PASS: 2-staff score has only 1 \\time directive\n');
  });

  test('3-staff score: \\time appears only once', async ({ page }) => {
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Soprano</part-name></score-part>
    <score-part id="P2"><part-name>Alto</part-name></score-part>
    <score-part id="P3"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
  <part id="P3">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const result = await convertToLilyPond(page, musicxml);
    expect(result.success).toBe(true);

    const lilypond = result.lilypond;
    const timeCount = (lilypond.match(/\\time\s+\d+\/\d+/g) || []).length;
    const staffCount = (lilypond.match(/\\new\s+Staff/g) || []).length;

    console.log(`\n✓ Found ${staffCount} staves`);
    console.log(`✓ Found ${timeCount} \\time directive(s)`);

    expect(staffCount).toBe(3);
    expect(timeCount).toBe(1);

    console.log('✅ PASS: 3-staff score has only 1 \\time directive\n');
  });

  test('single staff: \\time still present', async ({ page }) => {
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Solo</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const result = await convertToLilyPond(page, musicxml);
    expect(result.success).toBe(true);

    const lilypond = result.lilypond;
    const timeCount = (lilypond.match(/\\time\s+\d+\/\d+/g) || []).length;
    const staffCount = (lilypond.match(/\\new\s+Staff/g) || []).length;

    console.log(`\n✓ Found ${staffCount} staff`);
    console.log(`✓ Found ${timeCount} \\time directive(s)`);

    expect(staffCount).toBe(1);
    expect(timeCount).toBe(1);  // Single staff should still have \time

    console.log('✅ PASS: Single-staff score still has \\time\n');
  });

  test('multi-staff with different time signatures per measure', async ({ page }) => {
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
    <score-part id="P2"><part-name>Part 2</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>3</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>F</step><octave>3</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const result = await convertToLilyPond(page, musicxml);
    expect(result.success).toBe(true);

    const lilypond = result.lilypond;
    const timeMatches = lilypond.match(/\\time\s+\d+\/\d+/g) || [];

    console.log(`\n✓ Found ${timeMatches.length} \\time directives`);
    console.log(`  ${timeMatches.join(', ')}`);

    // Note: Currently mid-score time changes may appear per staff (acceptable behavior)
    // The fix specifically targets INITIAL attributes only
    // Verify at least initial \time 4/4 appears only once
    const time44Count = timeMatches.filter(t => t.includes('4/4')).length;
    console.log(`  \\time 4/4 appears ${time44Count} time(s)`);

    expect(time44Count).toBe(1);  // Initial time signature not duplicated
    expect(timeMatches[0]).toContain('4/4');

    console.log('✅ PASS: Initial time signature not duplicated\n');
  });

  test('should not repeat \\time within same staff when unchanged', async ({ page }) => {
    // Test for the issue shown by the user: \time 4/4 repeated multiple times
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Solo</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
    <measure number="3">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const result = await convertToLilyPond(page, musicxml);
    expect(result.success).toBe(true);

    const lilypond = result.lilypond;
    const timeMatches = lilypond.match(/\\time\s+4\/4/g) || [];

    console.log('\n========== Unchanged Time Signature Test ==========');
    console.log(`✓ Found ${timeMatches.length} \\time 4/4 directive(s)`);

    // Should only appear ONCE even though it's in 3 measures
    expect(timeMatches.length).toBe(1);

    console.log('✅ PASS: Unchanged \\time not repeated\n');
  });

  test('should emit \\time when it actually changes', async ({ page }) => {
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Solo</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
    <measure number="2">
      <attributes>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
    <measure number="3">
      <attributes>
        <time><beats>6</beats><beat-type>8</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>256</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const result = await convertToLilyPond(page, musicxml);
    expect(result.success).toBe(true);

    const lilypond = result.lilypond;
    const timeMatches = lilypond.match(/\\time\s+\d+\/\d+/g) || [];

    console.log('\n========== Changing Time Signature Test ==========');
    console.log(`✓ Found ${timeMatches.length} \\time directives`);
    console.log(`  ${timeMatches.join(', ')}`);

    // Should have 3 different time signatures
    expect(timeMatches.length).toBe(3);
    expect(timeMatches[0]).toContain('4/4');
    expect(timeMatches[1]).toContain('3/4');
    expect(timeMatches[2]).toContain('6/8');

    console.log('✅ PASS: Time signature changes properly emitted\n');
  });
});
