/**
 * E2E Test: MusicXML with part-group should convert to LilyPond StaffGroup
 *
 * When MusicXML contains multiple parts wrapped in <part-group>, the LilyPond
 * converter should generate \new StaffGroup << >> with separate \new Staff for each part.
 *
 * This happens when user creates multiple staves on the same system:
 *   - Type "1" in first staff
 *   - Line � New System (creates new staff with same system_id)
 *   - Type "2" in second staff
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

test.describe('MusicXML to LilyPond: part-group � StaffGroup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForWASM(page);
  });

  test('MUST create StaffGroup with 2 Staff contexts for grouped parts', async ({ page }) => {
    // MusicXML with part-group (same system_id)
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>
    <part-group type="start" number="1">
      <group-symbol>bracket</group-symbol>
      <group-barline>yes</group-barline>
    </part-group>
    <score-part id="P1">
      <part-name>Staff</part-name>
    </score-part>
    <score-part id="P2">
      <part-name>Staff</part-name>
    </score-part>
    <part-group type="stop" number="1"/>
  </part-list>
  <part id="P1">
<measure number="1">
  <attributes>
    <divisions>1</divisions>
    <key><fifths>0</fifths></key>
    <time print-object="no">
      <beats>4</beats>
      <beat-type>4</beat-type>
    </time>
    <clef><sign>G</sign><line>2</line></clef>
  </attributes>
<note>
  <pitch>
    <step>C</step>
    <octave>4</octave>
  </pitch>
  <duration>1</duration>
  <type>quarter</type>
</note>
</measure>
  </part>
  <part id="P2">
<measure number="1">
  <attributes>
    <divisions>1</divisions>
    <key><fifths>0</fifths></key>
    <time print-object="no">
      <beats>4</beats>
      <beat-type>4</beat-type>
    </time>
    <clef><sign>G</sign><line>2</line></clef>
  </attributes>
<note>
  <pitch>
    <step>D</step>
    <octave>4</octave>
  </pitch>
  <duration>1</duration>
  <type>quarter</type>
</note>
</measure>
  </part>
</score-partwise>`;

    const result = await convertToLilyPond(page, musicxml);

    expect(result.success).toBe(true);
    const lilypond = result.lilypond;

    console.log('\n========== LilyPond Output for part-group ==========');
    console.log(lilypond);
    console.log('====================================================\n');

    // Normalize whitespace for reliable testing
    const normalized = lilypond
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();

    // CRITICAL ASSERTION 1: Must contain \new StaffGroup
    expect(normalized).toContain('\\new StaffGroup');

    // CRITICAL ASSERTION 2: Must have TWO separate \new Staff contexts
    // Use negative lookahead to exclude StaffGroup
    const staffMatches = normalized.match(/\\new Staff(?!Group)/g);
    expect(staffMatches).not.toBeNull();
    expect(staffMatches.length).toBe(2);

    // CRITICAL ASSERTION 3: Must use << >> for simultaneous staves
    expect(normalized).toContain('<<');
    expect(normalized).toContain('>>');

    // CRITICAL ASSERTION 4: Should NOT use \break (that's for different systems)
    expect(normalized).not.toContain('\\break');

    // CRITICAL ASSERTION 5: Verify structure pattern
    // Pattern: \new StaffGroup << \new Staff { ... } \new Staff { ... } >>
    const staffGroupPattern = /\\new\s+StaffGroup\s*<<.*\\new\s+Staff.*\\new\s+Staff.*>>/s;
    expect(normalized).toMatch(staffGroupPattern);

    console.log(' PASS: part-group correctly generates StaffGroup\n');
  });

  test('single part without part-group should NOT use StaffGroup', async ({ page }) => {
    // MusicXML without part-group (single part)
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Staff</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
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
    const normalized = lilypond.replace(/\s+/g, ' ').trim();

    // Should NOT have StaffGroup for single part
    expect(normalized).not.toContain('\\new StaffGroup');

    // Should have exactly one \new Staff
    const staffMatches = normalized.match(/\\new Staff(?!Group)/g);
    expect(staffMatches).not.toBeNull();
    expect(staffMatches.length).toBe(1);

    console.log(' PASS: Single part correctly uses simple Staff\n');
  });

  test('3 parts in one part-group should create StaffGroup with 3 Staff contexts', async ({ page }) => {
    // MusicXML with 3 parts in one group
    const musicxml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <part-group type="start" number="1">
      <group-symbol>bracket</group-symbol>
      <group-barline>yes</group-barline>
    </part-group>
    <score-part id="P1"><part-name>Soprano</part-name></score-part>
    <score-part id="P2"><part-name>Alto</part-name></score-part>
    <score-part id="P3"><part-name>Bass</part-name></score-part>
    <part-group type="stop" number="1"/>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>256</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
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
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
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
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
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
    const normalized = lilypond.replace(/\s+/g, ' ').trim();

    // Must have StaffGroup for 3 parts
    expect(normalized).toContain('\\new StaffGroup');

    // Must have exactly THREE \new Staff contexts
    const staffMatches = normalized.match(/\\new Staff(?!Group)/g);
    expect(staffMatches).not.toBeNull();
    expect(staffMatches.length).toBe(3);

    console.log(' PASS: 3-part group correctly generates StaffGroup with 3 staves\n');
  });
});
