/**
 * Tests for lyrics rendering with Lilypond-style syllable distribution
 */

import { parseLyrics, distributeLyrics } from '../src/js/lyrics-renderer.js';

// Helper to create a mock cell
function createCell(kind, slurIndicator = 0, x = 0) {
  return {
    kind,
    slurIndicator,
    slur_indicator: slurIndicator,
    x,
    y: 32,
    glyph: kind === 1 ? 'S' : '-'
  };
}

// Test: Parse simple lyrics
console.log('Test 1: Parse simple lyrics');
{
  const result = parseLyrics('hello world');
  console.assert(result.length === 2, 'Should have 2 syllables');
  console.assert(result[0] === 'hello', 'First syllable should be "hello"');
  console.assert(result[1] === 'world', 'Second syllable should be "world"');
  console.log('✓ Test 1 passed');
}

// Test: Parse hyphenated lyrics
console.log('\nTest 2: Parse hyphenated lyrics');
{
  const result = parseLyrics('hel-lo wor-ld');
  console.assert(result.length === 4, `Should have 4 syllables, got ${result.length}`);
  console.assert(result[0] === 'hel-', `First syllable should be "hel-", got "${result[0]}"`);
  console.assert(result[1] === 'lo', `Second syllable should be "lo", got "${result[1]}"`);
  console.assert(result[2] === 'wor-', `Third syllable should be "wor-", got "${result[2]}"`);
  console.assert(result[3] === 'ld', `Fourth syllable should be "ld", got "${result[3]}"`);
  console.log('✓ Test 2 passed');
}

// Test: Distribute syllables to pitches (no slurs)
console.log('\nTest 3: Distribute syllables to pitches (no slurs)');
{
  const cells = [
    createCell(1, 0, 0),   // Pitch S
    createCell(1, 0, 20),  // Pitch R
    createCell(1, 0, 40),  // Pitch G
  ];
  const result = distributeLyrics('one two three', cells);
  console.assert(result.length === 3, `Should have 3 assignments, got ${result.length}`);
  console.assert(result[0].syllable === 'one', 'First syllable should be "one"');
  console.assert(result[0].cellIndex === 0, 'First syllable at cell 0');
  console.assert(result[1].syllable === 'two', 'Second syllable should be "two"');
  console.assert(result[2].syllable === 'three', 'Third syllable should be "three"');
  console.log('✓ Test 3 passed');
}

// Test: Distribute with melisma (slur)
console.log('\nTest 4: Distribute with melisma (slur)');
{
  // Pattern: S(slur start) R G(slur end) M P
  // Expected: "one" on S, skip R and G (melisma), "two" on M, "three" on P
  const cells = [
    createCell(1, 1, 0),   // Pitch S - SlurStart
    createCell(1, 0, 20),  // Pitch R - inside slur
    createCell(1, 2, 40),  // Pitch G - SlurEnd
    createCell(1, 0, 60),  // Pitch M
    createCell(1, 0, 80),  // Pitch P
  ];
  const result = distributeLyrics('one two three', cells);
  console.assert(result.length === 3, `Should have 3 assignments, got ${result.length}: ${JSON.stringify(result)}`);
  console.assert(result[0].cellIndex === 0, 'First syllable at cell 0 (slur start)');
  console.assert(result[0].syllable === 'one', 'First syllable should be "one"');
  console.assert(result[1].cellIndex === 3, `Second syllable at cell 3, got ${result[1].cellIndex}`);
  console.assert(result[1].syllable === 'two', 'Second syllable should be "two"');
  console.assert(result[2].cellIndex === 4, 'Third syllable at cell 4');
  console.assert(result[2].syllable === 'three', 'Third syllable should be "three"');
  console.log('✓ Test 4 passed');
}

// Test: Multiple melismas
console.log('\nTest 5: Multiple melismas');
{
  // Pattern: S(slur) R(end) | G(slur) M(end) | P D
  const cells = [
    createCell(1, 1, 0),   // S - SlurStart
    createCell(1, 2, 20),  // R - SlurEnd
    createCell(6, 0, 40),  // Barline (non-pitch)
    createCell(1, 1, 60),  // G - SlurStart
    createCell(1, 2, 80),  // M - SlurEnd
    createCell(6, 0, 100), // Barline
    createCell(1, 0, 120), // P
    createCell(1, 0, 140), // D
  ];
  const result = distributeLyrics('one two three four', cells);
  console.assert(result.length === 4, `Should have 4 assignments, got ${result.length}`);
  console.assert(result[0].cellIndex === 0, 'Syllable 1 at cell 0 (first slur start)');
  console.assert(result[1].cellIndex === 3, 'Syllable 2 at cell 3 (second slur start)');
  console.assert(result[2].cellIndex === 6, 'Syllable 3 at cell 6');
  console.assert(result[3].cellIndex === 7, 'Syllable 4 at cell 7');
  console.log('✓ Test 5 passed');
}

// Test: Skip non-pitched elements
console.log('\nTest 6: Skip non-pitched elements');
{
  const cells = [
    createCell(1, 0, 0),   // Pitch S
    createCell(6, 0, 20),  // Barline (skip)
    createCell(1, 0, 40),  // Pitch R
    createCell(8, 0, 60),  // Whitespace (skip)
    createCell(1, 0, 80),  // Pitch G
  ];
  const result = distributeLyrics('one two three', cells);
  console.assert(result.length === 3, `Should have 3 assignments, got ${result.length}`);
  console.assert(result[0].cellIndex === 0, 'First syllable at cell 0');
  console.assert(result[1].cellIndex === 2, 'Second syllable at cell 2');
  console.assert(result[2].cellIndex === 4, 'Third syllable at cell 4');
  console.log('✓ Test 6 passed');
}

// Test: Empty lyrics
console.log('\nTest 7: Empty lyrics');
{
  const cells = [createCell(1, 0, 0), createCell(1, 0, 20)];
  const result = distributeLyrics('', cells);
  console.assert(result.length === 0, 'Empty lyrics should return no assignments');
  console.log('✓ Test 7 passed');
}

// Test: More syllables than pitches
console.log('\nTest 8: More syllables than pitches');
{
  const cells = [createCell(1, 0, 0), createCell(1, 0, 20)];
  const result = distributeLyrics('one two three four', cells);
  console.assert(result.length === 2, 'Should only assign to available pitches');
  console.assert(result[0].syllable === 'one', 'First syllable');
  console.assert(result[1].syllable === 'two', 'Second syllable');
  console.log('✓ Test 8 passed');
}

// Test: More pitches than syllables
console.log('\nTest 9: More pitches than syllables');
{
  const cells = [
    createCell(1, 0, 0),
    createCell(1, 0, 20),
    createCell(1, 0, 40),
    createCell(1, 0, 60)
  ];
  const result = distributeLyrics('one two', cells);
  console.assert(result.length === 2, 'Should only assign available syllables');
  console.assert(result[0].cellIndex === 0, 'First assignment at cell 0');
  console.assert(result[1].cellIndex === 1, 'Second assignment at cell 1');
  console.log('✓ Test 9 passed');
}

console.log('\n✅ All tests passed!');
