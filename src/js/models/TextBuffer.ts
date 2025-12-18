/**
 * TextBuffer - JS-owned text buffer with codepoint-based editing
 *
 * This module implements the "JS owns text" architecture where:
 * - JS holds the source of truth as number[] (codepoints)
 * - WASM returns patches for mutations
 * - UTF-16 conversion happens only at textarea boundary
 */

import type { Patch } from '~types/wasm-module';
import type { Cell } from '~types/wasm';

/**
 * A single line in the text buffer
 */
export class Line {
  /** Source of truth - codepoints as JS array (no realloc on patch) */
  codepoints: number[];

  /** Whether this line needs WASM parse for display */
  dirty: boolean;

  /** Last parsed cells (for rendering) */
  cachedCells: Cell[] | null;

  /** Precomputed UTF-16 offsets: utf16Offsets[cpIndex] = utf16Offset */
  private utf16Offsets: number[] | null;

  constructor(codepoints: number[] = []) {
    this.codepoints = codepoints;
    this.dirty = true;
    this.cachedCells = null;
    this.utf16Offsets = null;
  }

  /**
   * Convert to string for textarea display (chunked to avoid arg limit)
   */
  toString(): string {
    if (this.codepoints.length === 0) return '';

    let out = '';
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < this.codepoints.length; i += CHUNK_SIZE) {
      const chunk = this.codepoints.slice(i, i + CHUNK_SIZE);
      out += String.fromCodePoint(...chunk);
    }
    return out;
  }

  /**
   * Apply patch from WASM - O(1) splice, no realloc
   */
  applyPatch(patch: Patch): void {
    this.codepoints.splice(
      patch.start_cp,
      patch.end_cp - patch.start_cp,
      ...patch.replacement
    );
    this.dirty = true;
    this.utf16Offsets = null; // Invalidate cache
  }

  /**
   * Build offset table for O(1) cursor mapping
   * Call after edits or lazily on first mapping
   */
  buildUtf16Offsets(): void {
    this.utf16Offsets = new Array(this.codepoints.length + 1);
    let offset = 0;
    for (let i = 0; i < this.codepoints.length; i++) {
      this.utf16Offsets[i] = offset;
      offset += (this.codepoints[i] > 0xFFFF ? 2 : 1);
    }
    this.utf16Offsets[this.codepoints.length] = offset;
  }

  /**
   * Get UTF-16 offset for a codepoint index - O(1) lookup
   */
  cpToUtf16(cpIndex: number): number {
    if (!this.utf16Offsets) this.buildUtf16Offsets();
    if (cpIndex < 0) return 0;
    if (cpIndex >= this.utf16Offsets!.length) {
      return this.utf16Offsets![this.utf16Offsets!.length - 1];
    }
    return this.utf16Offsets![cpIndex];
  }

  /**
   * Get codepoint index for a UTF-16 offset - O(log n) binary search
   */
  utf16ToCp(utf16Off: number): number {
    if (!this.utf16Offsets) this.buildUtf16Offsets();
    const offsets = this.utf16Offsets!;

    if (utf16Off <= 0) return 0;
    if (utf16Off >= offsets[offsets.length - 1]) {
      return this.codepoints.length;
    }

    // Binary search for the codepoint index
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= utf16Off) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /**
   * Create from string (parse into codepoints)
   */
  static fromString(str: string): Line {
    const codepoints = [...str].map(c => c.codePointAt(0)!);
    return new Line(codepoints);
  }

  /**
   * Get length in codepoints
   */
  get length(): number {
    return this.codepoints.length;
  }
}

/**
 * Combining chars that need WASM for mutation (not just display)
 */
export const COMBINING_CHARS = new Set([
  0x23,   // # (sharp)
  0x62,   // b (flat)
  0x2F,   // / (barline component)
  0x7C,   // | (barline component)
  0x3A,   // : (repeat component)
]);

/**
 * Check if a codepoint is a combining char
 */
export function isCombiningChar(cp: number): boolean {
  return COMBINING_CHARS.has(cp);
}

/**
 * Simple chars set - initialized from WASM at startup
 */
let SIMPLE_CHARS: Set<number> | null = null;

/**
 * Initialize simple chars from WASM
 */
export function initSimpleChars(cps: number[]): void {
  SIMPLE_CHARS = new Set(cps);
}

/**
 * Check if a codepoint is a simple char (can be handled by JS without WASM)
 */
export function isSimpleChar(cp: number): boolean {
  // If not initialized, assume everything needs WASM
  if (!SIMPLE_CHARS) return false;
  return SIMPLE_CHARS.has(cp) && !COMBINING_CHARS.has(cp);
}

// ========== Tests ==========

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  // Unit tests for Line class
  const testLine = () => {
    // Test basic creation
    const line = new Line([0x31, 0x32, 0x33]); // "123"
    console.assert(line.toString() === '123', 'toString failed');
    console.assert(line.length === 3, 'length failed');

    // Test patch application
    const patch: Patch = {
      start_cp: 1,
      end_cp: 2,
      replacement: [0x41, 0x42], // Replace "2" with "AB"
      new_cursor_cp: 3
    };
    line.applyPatch(patch);
    console.assert(line.toString() === '1AB3', 'applyPatch failed');
    console.assert(line.length === 4, 'length after patch failed');
    console.assert(line.dirty === true, 'dirty flag failed');

    // Test UTF-16 mapping with BMP chars
    const bmpLine = new Line([0x31, 0x32, 0x33]); // "123"
    console.assert(bmpLine.cpToUtf16(0) === 0, 'cpToUtf16(0) failed');
    console.assert(bmpLine.cpToUtf16(1) === 1, 'cpToUtf16(1) failed');
    console.assert(bmpLine.cpToUtf16(3) === 3, 'cpToUtf16(3) failed');
    console.assert(bmpLine.utf16ToCp(0) === 0, 'utf16ToCp(0) failed');
    console.assert(bmpLine.utf16ToCp(2) === 2, 'utf16ToCp(2) failed');

    // Test UTF-16 mapping with supplementary plane chars (surrogate pairs)
    const supLine = new Line([0x31, 0x1F600, 0x33]); // "1😀3" - emoji is > 0xFFFF
    console.assert(supLine.cpToUtf16(0) === 0, 'sup cpToUtf16(0) failed');
    console.assert(supLine.cpToUtf16(1) === 1, 'sup cpToUtf16(1) failed');
    console.assert(supLine.cpToUtf16(2) === 3, 'sup cpToUtf16(2) failed'); // After surrogate pair
    console.assert(supLine.utf16ToCp(0) === 0, 'sup utf16ToCp(0) failed');
    console.assert(supLine.utf16ToCp(1) === 1, 'sup utf16ToCp(1) failed');
    console.assert(supLine.utf16ToCp(3) === 2, 'sup utf16ToCp(3) failed');

    // Test fromString
    const fromStr = Line.fromString('ABC');
    console.assert(fromStr.length === 3, 'fromString length failed');
    console.assert(fromStr.codepoints[0] === 0x41, 'fromString codepoint failed');

    console.log('All Line tests passed!');
  };

  testLine();
}
