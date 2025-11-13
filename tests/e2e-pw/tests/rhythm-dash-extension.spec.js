import { test, expect } from '@playwright/test';

/**
 * Test for rhythm analysis of "1--2 --3-" according to updated @RHYTHM.md
 *
 * Critical Rule: Dashes become rests ONLY when:
 * 1. No previous pitch (start of line)
 * 2. After a breath mark
 * 3. After end of line
 *
 * Spaces (beat boundaries) do NOT reset pitch context!
 *
 * Expected behavior for "1--2 --3-":
 * - Beat 1: "1--2"
 *   - "1" consumes trailing "--" → gets 3 subdivisions
 *   - "2" stands alone → gets 1 subdivision
 * - Beat 2: "--3-"
 *   - Leading "--" EXTENDS the previous "2" (not a rest!)
 *   - "3" consumes trailing "-" → gets remaining subdivisions
 *
 * Result: "2" ties across beat boundary
 * LilyPond: c8. d16~ d4 e4 (or similar with ties)
 */
test('RHYTHM: "1--2 --3-" should extend previous pitch across beat boundary', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type the rhythmic pattern: 2 beats, 3 pitches
  const input = '1--2 --3-';
  await page.keyboard.type(input);

  // Count beats in input (separated by spaces)
  const inputBeats = input.split(/\s+/).filter(b => b.length > 0);
  console.log('[Input beats]:', inputBeats, `(${inputBeats.length} beats)`);
  expect(inputBeats.length).toBe(2); // Verify we start with 2 beats

  // Count distinct pitches in input (non-dash characters)
  const inputPitches = input.match(/[^-\s]/g);
  console.log('[Input pitches]:', inputPitches, `(${inputPitches.length} distinct pitches)`);
  expect(inputPitches?.length).toBe(3); // 1, 2, 3

  // Open LilyPond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Wait for LilyPond output
  const lilypondPane = page.getByTestId('pane-lilypond');
  await expect(lilypondPane).toBeVisible();

  await expect.poll(async () => {
    const text = await lilypondPane.innerText();
    return text.trim().length;
  }).toBeGreaterThan(0);

  const lilypondOutput = (await lilypondPane.innerText())
    .replace(/\r\n/g, '\n')
    .trim();

  console.log('[LilyPond Output]:\n', lilypondOutput);

  // Key assertion: "2" (d) should have a tie (~) indicating it extends across beat boundary
  // The exact durations may vary, but there must be a tie on d
  expect(lilypondOutput).toMatch(/d['\d]+\s*~/); // d with duration followed by tie

  // Should NOT contain rests (no r8 or r16, etc.)
  expect(lilypondOutput).not.toMatch(/r\d+/);

  // Count distinct pitches in output (should match input: 3 pitches)
  const noteMatches = lilypondOutput.match(/[cde][']*[\d.]+/gi);
  console.log('[Output notes]:', noteMatches);

  if (noteMatches) {
    // Extract unique pitch names (c, d, e - ignoring octaves and durations)
    const uniquePitches = [...new Set(noteMatches.map(n => n[0].toLowerCase()))];
    console.log('[Unique pitches in output]:', uniquePitches, `(${uniquePitches.length} distinct pitches)`);

    // CRITICAL ASSERTION: Same number of distinct pitches out as in
    expect(uniquePitches.length).toBe(3); // c, d, e (matching input: 1, 2, 3)

    // First note should be c (the "1")
    expect(noteMatches[0]).toMatch(/^c/i);

    // Should have d notes (at least 2 for the tie: d16~ d4 or similar)
    const dNotes = noteMatches.filter(n => /^d/i.test(n));
    expect(dNotes.length).toBeGreaterThanOrEqual(2); // Tied note appears twice

    // Last note should be e (the "3")
    expect(noteMatches[noteMatches.length - 1]).toMatch(/^e/i);
  }

  // CRITICAL: Calculate total duration in 16th notes
  // Input: 2 beats with 4 subdivisions each = 8 subdivisions total
  // If each beat maps to a quarter note (4 16ths), then 2 beats = 8 16ths
  const calculateDuration = (note) => {
    // Extract duration number and check for dot
    const match = note.match(/(\d+)(\.)?/);
    if (!match) return 0;

    const base = parseInt(match[1]);
    const hasDot = !!match[2];

    // Convert to 16th notes (16 = 1 sixteenth, 8 = 2 sixteenths, 4 = 4 sixteenths, etc.)
    let sixteenths = 16 / base;
    if (hasDot) sixteenths *= 1.5; // Dotted note is 1.5x duration

    return sixteenths;
  };

  if (noteMatches) {
    const totalSixteenths = noteMatches.reduce((sum, note) => sum + calculateDuration(note), 0);
    console.log('[Total duration in 16ths]:', totalSixteenths);
    console.log('[Expected for 2 beats]:', 8, '(2 beats × 4 16ths per beat)');

    // CRITICAL BUG ASSERTION: 2 beats in should equal 2 beats out (8 sixteenths)
    // Current output is 3 beats (12 sixteenths) - THIS IS WRONG!
    expect(totalSixteenths).toBe(8); // Should be 2 beats = 8 sixteenths
  }
});

test('RHYTHM: Leading dashes at start of line ARE rests', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByTestId('editor-root');
  await expect(editor).toBeVisible();
  await editor.click();

  // Type pattern with leading dashes (no previous pitch)
  await page.keyboard.type('--1-2');

  // Open LilyPond tab
  const lilypondTab = page.getByTestId('tab-lilypond');
  await expect(lilypondTab).toBeVisible();
  await lilypondTab.click();

  // Wait for LilyPond output
  const lilypondPane = page.getByTestId('pane-lilypond');
  await expect(lilypondPane).toBeVisible();

  await expect.poll(async () => {
    const text = await lilypondPane.innerText();
    return text.trim().length;
  }).toBeGreaterThan(0);

  const lilypondOutput = (await lilypondPane.innerText())
    .replace(/\r\n/g, '\n')
    .trim();

  console.log('[LilyPond Output for leading dashes]:\n', lilypondOutput);

  // Leading dashes with no previous pitch MUST become rests
  expect(lilypondOutput).toMatch(/r[\d.]+/); // Should contain rest notation
});

// TODO: Add test for breath mark once the feature is fully implemented
// test('RHYTHM: Dashes after breath mark ARE rests', async ({ page }) => {
//   // Breath marks should reset pitch context, making following dashes become rests
// });
