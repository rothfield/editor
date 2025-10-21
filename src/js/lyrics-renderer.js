/**
 * Lyrics Renderer - Lilypond-style syllable distribution
 *
 * Implements FSM-based algorithm for distributing lyrics syllables to pitches,
 * respecting slurs (melismas) where multiple notes share one syllable.
 */

import { BASE_FONT_SIZE } from './constants.js';

/**
 * FSM States for lyrics distribution
 */
const LyricsState = {
  SEEKING_PITCH: 'SEEKING_PITCH',      // Looking for next pitch to assign syllable
  IN_MELISMA: 'IN_MELISMA',            // Inside a slur, skip pitches
  SYLLABLE_ASSIGNED: 'SYLLABLE_ASSIGNED' // Just assigned, move to next
};

/**
 * Parse lyrics string into syllables
 * Splits on spaces and hyphens, preserving hyphen indicators
 *
 * Examples:
 *   "hello world" -> ["hello", "world"]
 *   "hel-lo wor-ld" -> ["hel-", "lo", "wor-", "ld"]
 *   "he--llo" -> ["he-", "-", "llo"]
 *
 * @param {string} lyrics - Raw lyrics string
 * @returns {string[]} Array of syllables
 */
export function parseLyrics(lyrics) {
  if (!lyrics || lyrics.trim() === '') {
    return [];
  }

  const syllables = [];
  const words = lyrics.trim().split(/\s+/); // Split on whitespace

  for (const word of words) {
    if (word === '') continue;

    // Split on hyphens but keep them as part of the syllable
    const parts = word.split(/(-)/); // Captures the delimiter

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '') continue;

      if (part === '-') {
        // Standalone hyphen (from "he--llo") - treat as continuation marker
        syllables.push('-');
      } else if (i < parts.length - 1 && parts[i + 1] === '-') {
        // Part followed by hyphen - combine them
        syllables.push(part + '-');
        i++; // Skip the hyphen in next iteration
      } else {
        // Regular part with no hyphen
        syllables.push(part);
      }
    }
  }

  return syllables;
}

/**
 * Distribute syllables to pitch elements, respecting slurs (melismas)
 *
 * Algorithm (FSM):
 * 1. Parse lyrics into syllables
 * 2. Scan cells left to right
 * 3. For each pitched element:
 *    - If in melisma (inside slur), skip (no syllable)
 *    - If slur starts here, assign syllable and enter melisma state
 *    - If normal pitch, assign syllable
 * 4. Track slur depth for nested slurs
 *
 * @param {string} lyrics - Raw lyrics string
 * @param {Array} cells - Array of Cell objects from the line
 * @returns {Array} Array of {cellIndex, syllable, x, y} for rendering
 */
export function distributeLyrics(lyrics, cells) {
  const syllables = parseLyrics(lyrics);
  const assignments = [];

  if (syllables.length === 0 || !cells || cells.length === 0) {
    return assignments;
  }

  let syllableIndex = 0;
  let state = LyricsState.SEEKING_PITCH;
  let slurDepth = 0; // Track nested slurs

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];

    // Only process pitched elements (kind === 1)
    if (cell.kind !== 1) {
      continue;
    }

    // Track slur state
    const slurIndicator = cell.slurIndicator || cell.slur_indicator || 0;

    if (slurIndicator === 1 || slurIndicator === 'SlurStart') {
      // Slur starts - assign syllable to this pitch, then enter melisma
      if (syllableIndex < syllables.length) {
        assignments.push({
          cellIndex: i,
          syllable: syllables[syllableIndex],
          x: cell.x || 0,
          y: cell.y || 32
        });
        syllableIndex++;
      }

      slurDepth++;
      state = LyricsState.IN_MELISMA;
      continue;
    }

    if (slurIndicator === 2 || slurIndicator === 'SlurEnd') {
      // Slur ends - this pitch is still part of melisma, don't assign
      slurDepth = Math.max(0, slurDepth - 1);

      if (slurDepth === 0) {
        state = LyricsState.SEEKING_PITCH;
      }
      continue;
    }

    // Normal pitch or inside melisma
    if (state === LyricsState.IN_MELISMA) {
      // Inside slur - skip this pitch (part of melisma)
      continue;
    }

    // Assign syllable to this pitch
    if (syllableIndex < syllables.length) {
      assignments.push({
        cellIndex: i,
        syllable: syllables[syllableIndex],
        x: cell.x || 0,
        y: cell.y || 32
      });
      syllableIndex++;
      state = LyricsState.SYLLABLE_ASSIGNED;
    }
  }

  return assignments;
}

/**
 * Render lyrics assignments to DOM elements
 * Creates positioned spans for each syllable below its note
 *
 * NOTE: Lyrics positioning is adaptive based on beat loop presence:
 * - With beat loops: positioned below beat loops (Y=65px, includes 1/3 font height spacing)
 * - Without beat loops: positioned closer to cells (Y=57px, includes 1/3 font height spacing)
 *
 * @param {Array} assignments - Output from distributeLyrics()
 * @param {HTMLElement} lineElement - Line container element
 * @param {boolean} hasBeatLoops - Whether the line has beat loops to render
 */
export function renderLyricsAssignments(assignments, lineElement, hasBeatLoops = true) {
  // Remove any existing lyrics elements
  const existingLyrics = lineElement.querySelectorAll('.lyric-syllable');
  existingLyrics.forEach(el => el.remove());

  // Adaptive positioning based on beat loop presence
  // Cell top = 32px, cell height = 16px, cell bottom = 48px
  // Beat loop = 48px + 2px gap + 5px height = ends at ~55px
  // Font height = 16px, 1/3 of font height = ~5.33px additional spacing
  // Lyrics with beat loops: 65px (below beat loops + 1/3 font height)
  // Lyrics without beat loops: 57px (closer to cells + 1/3 font height)
  const LYRICS_Y_WITH_BEATS = 65;    // Below beat loops (60px + 5px = 1/3 font height)
  const LYRICS_Y_WITHOUT_BEATS = 57; // Close to cells (52px + 5px = 1/3 font height)

  const LYRICS_Y_POSITION = hasBeatLoops ? LYRICS_Y_WITH_BEATS : LYRICS_Y_WITHOUT_BEATS;
  const lyricFontSize = BASE_FONT_SIZE * 0.5; // 1/2 of base font size

  for (const assignment of assignments) {
    const syllableElement = document.createElement('span');
    syllableElement.className = 'lyric-syllable';
    syllableElement.textContent = assignment.syllable;
    syllableElement.style.position = 'absolute';
    syllableElement.style.left = `${assignment.x}px`;
    syllableElement.style.top = `${LYRICS_Y_POSITION}px`;
    syllableElement.style.fontSize = `${lyricFontSize}px`;
    syllableElement.style.fontFamily = "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
    syllableElement.style.fontStyle = 'italic';
    syllableElement.style.color = '#6b7280'; // gray-500
    syllableElement.style.pointerEvents = 'none';
    syllableElement.style.whiteSpace = 'nowrap';

    lineElement.appendChild(syllableElement);
  }
}

/**
 * Main entry point - parse, distribute, and render lyrics for a line
 *
 * @param {string} lyrics - Raw lyrics string
 * @param {Array} cells - Array of Cell objects
 * @param {HTMLElement} lineElement - Line container element
 * @param {boolean} hasBeatLoops - Whether the line has beat loops to render
 */
export function renderLyrics(lyrics, cells, lineElement, hasBeatLoops = true) {
  const assignments = distributeLyrics(lyrics, cells);
  renderLyricsAssignments(assignments, lineElement, hasBeatLoops);
}

export default {
  parseLyrics,
  distributeLyrics,
  renderLyricsAssignments,
  renderLyrics
};
