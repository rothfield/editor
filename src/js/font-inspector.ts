/**
 * Font Inspector - Explore ~50,000 glyphs organized by category
 *
 * Categories derived from atoms.yaml:
 * 1. Base Pitches - 33 base characters (natural, octave 0)
 * 2. Octave Variants - 5 octaves per pitch
 * 3. Accidentals - 6 types (natural, flat, half-flat, double-flat, sharp, double-sharp)
 * 4. Line Variants - 15 per glyph (underline + overline combinations)
 * 5. Superscripts - 16 line variants per scaled glyph
 * 6. Symbols - SMuFL barlines, ornaments
 * 7. Notation Elements - dash, breath mark, space, barlines
 * 8. Example Beats - realistic beat patterns
 */

import logger, { LOG_CATEGORIES } from './logger.js';

interface FontConfig {
  systems?: Array<{
    system_name: string;
    pua_base: number;
    char_count: number;
    variants_per_character: number;
    total_glyphs: number;
  }>;
  symbols?: Array<{
    name: string;
    codepoint: number;
    label: string;
  }>;
}

interface PUASystem {
  base: number;
  chars: string;
  variantsPerChar: number;
  description: string;
}

interface PUASystems {
  [key: string]: PUASystem;
}

interface LineVariantConfig {
  base: number;
  variants: number;
}

interface NoteLineVariantConfig {
  base: number;
  sourceBase: number;
  noteCount: number;
}

interface SuperscriptConfig {
  base: number;
  sourceRange?: [number, number];
  sourceBase?: number;
  charCount?: number;
  chars?: number;
  variantsPerChar?: number;
}

interface NotationElement {
  base: number;
  lineBase: number;
}

interface PUAConfig {
  systems: PUASystems;
  lineVariants: {
    underlineOnly: LineVariantConfig;
    overlineOnly: LineVariantConfig;
    combined: LineVariantConfig;
  };
  noteLineVariants: { [key: string]: NoteLineVariantConfig };
  superscripts: { [key: string]: SuperscriptConfig };
  notationElements: { [key: string]: NotationElement };
  utility: { [key: string]: number };
}

interface OctaveInfo {
  idx: number;
  shift: number;
  label: string;
}

interface AccidentalInfo {
  name: string;
  symbol: string;
  typeIdx: number;
}

interface LineVariantInfo {
  idx: number;
  underline: string;
  overline: string;
  label: string;
}

interface SuperscriptLineVariantInfo {
  idx: number;
  label: string;
}

interface ContentResult {
  text: string;
  info: string;
}

// =============================================================================
// PUA allocations - MUST match atoms.yaml exactly
// Source: tools/fontgen/atoms.yaml (notation_systems section)
// =============================================================================
const PUA: PUAConfig = {
  // Per-system note glyphs (pitch + accidental + octave)
  // Formula: codepoint = pua_base + (char_index × 30) + variant_index
  // Where variant_index = (accidental_type × 5) + octave_idx
  systems: {
    // atoms.yaml: "Numerical scale degrees (1-7)"
    number: {
      base: 0xE000,
      chars: '1234567',
      variantsPerChar: 30,
      description: 'Numerical scale degrees (1-7)'
    },
    // atoms.yaml: "Standard CDEFGAB notation" - "Octaves indicated by dots above/below, not by case"
    western: {
      base: 0xE100,
      chars: 'CDEFGAB',
      variantsPerChar: 30,
      description: 'Western letter names (uppercase only, octaves by dots)'
    },
    // atoms.yaml: "Indian classical music notation" - case distinguishes lower/upper variants
    sargam: {
      base: 0xE300,
      chars: 'SrRgGmMPdDnN',
      variantsPerChar: 30,
      description: 'Sargam - case distinguishes pitch variants (r=komal, R=shuddha)'
    },
    // atoms.yaml: "Solfège notation (drmfslt)" - "Octaves indicated by dots above/below, not by case"
    doremi: {
      base: 0xE500,
      chars: 'drmfslt',
      variantsPerChar: 30,
      description: 'Solfège (lowercase only, octaves by dots)'
    }
  },

  // Line variants for ASCII printable (0x20-0x7E = 95 chars)
  lineVariants: {
    underlineOnly: { base: 0xE800, variants: 3 },  // middle, left, right
    overlineOnly: { base: 0xE920, variants: 3 },
    combined: { base: 0xEA40, variants: 9 }  // 3 underline × 3 overline
  },

  // Per-system line variants for pitched notes (15 variants each)
  noteLineVariants: {
    number: { base: 0x1A000, sourceBase: 0xE000, noteCount: 210 },
    western: { base: 0x1B000, sourceBase: 0xE100, noteCount: 210 },
    sargam: { base: 0x1D000, sourceBase: 0xE300, noteCount: 360 },
    doremi: { base: 0x1F000, sourceBase: 0xE500, noteCount: 210 }
  },

  // Superscripts (50% scaled, 16 variants per source glyph)
  // Char counts MUST match atoms.yaml
  superscripts: {
    ascii: { base: 0xF8000, sourceRange: [0x20, 0x7E], charCount: 95 },
    number: { base: 0xF8600, sourceBase: 0xE000, chars: 7, variantsPerChar: 30 },
    western: { base: 0xF9400, sourceBase: 0xE100, chars: 7, variantsPerChar: 30 },
    sargam: { base: 0xFAF00, sourceBase: 0xE300, chars: 12, variantsPerChar: 30 },
    doremi: { base: 0xFC600, sourceBase: 0xE500, chars: 7, variantsPerChar: 30 }
  },

  // Notation elements
  notationElements: {
    dash: { base: 0xE750, lineBase: 0x1E000 },
    breathMark: { base: 0xE751, lineBase: 0x1E00F },
    space: { base: 0xE752, lineBase: 0x1E01E },
    singleBarline: { base: 0xE753, lineBase: 0x1E02D },
    doubleBarline: { base: 0xE754, lineBase: 0x1E03C },
    repeatLeft: { base: 0xE755, lineBase: 0x1E04B },
    repeatRight: { base: 0xE756, lineBase: 0x1E05A }
  },

  // Utility glyphs
  utility: {
    loopBottomLeft: 0xE704,
    loopBottomRight: 0xE705,
    loopTopLeft: 0xE706,
    loopTopRight: 0xE707
  }
};

// Octave indices (must match Rust octave_index())
const OCTAVE_ORDER: OctaveInfo[] = [
  { idx: 0, shift: 0, label: 'octave 0 (base)' },
  { idx: 1, shift: -2, label: 'octave -2 (2 dots below)' },
  { idx: 2, shift: -1, label: 'octave -1 (1 dot below)' },
  { idx: 3, shift: +1, label: 'octave +1 (1 dot above)' },
  { idx: 4, shift: +2, label: 'octave +2 (2 dots above)' }
];

// Accidental type indices (must match atoms.yaml)
// Formula: variant_index = (accidental_type × 5) + octave_idx
// accidental_type: 0=natural, 1=flat, 2=half-flat, 3=double-flat, 4=double-sharp, 5=sharp
const ACCIDENTALS: AccidentalInfo[] = [
  { name: 'natural', symbol: '♮', typeIdx: 0 },
  { name: 'flat', symbol: '♭', typeIdx: 1 },
  { name: 'half-flat', symbol: 'ḥ♭', typeIdx: 2 },
  { name: 'double-flat', symbol: '𝄫', typeIdx: 3 },
  { name: 'double-sharp', symbol: '𝄪', typeIdx: 4 },
  { name: 'sharp', symbol: '♯', typeIdx: 5 }
];

// Line variant indices (15 total)
const LINE_VARIANTS: LineVariantInfo[] = [
  { idx: 0, underline: 'middle', overline: 'none', label: 'U-mid' },
  { idx: 1, underline: 'left', overline: 'none', label: 'U-left' },
  { idx: 2, underline: 'right', overline: 'none', label: 'U-right' },
  { idx: 3, underline: 'none', overline: 'middle', label: 'O-mid' },
  { idx: 4, underline: 'none', overline: 'left', label: 'O-left' },
  { idx: 5, underline: 'none', overline: 'right', label: 'O-right' },
  { idx: 6, underline: 'middle', overline: 'middle', label: 'U-mid+O-mid' },
  { idx: 7, underline: 'middle', overline: 'left', label: 'U-mid+O-left' },
  { idx: 8, underline: 'middle', overline: 'right', label: 'U-mid+O-right' },
  { idx: 9, underline: 'left', overline: 'middle', label: 'U-left+O-mid' },
  { idx: 10, underline: 'left', overline: 'left', label: 'U-left+O-left' },
  { idx: 11, underline: 'left', overline: 'right', label: 'U-left+O-right' },
  { idx: 12, underline: 'right', overline: 'middle', label: 'U-right+O-mid' },
  { idx: 13, underline: 'right', overline: 'left', label: 'U-right+O-left' },
  { idx: 14, underline: 'right', overline: 'right', label: 'U-right+O-right' }
];

// Superscript line variants (16 total) - note different order than regular lines
const SUPERSCRIPT_LINE_VARIANTS: SuperscriptLineVariantInfo[] = [
  { idx: 0, label: 'no lines' },
  { idx: 1, label: 'U-left' },
  { idx: 2, label: 'U-middle' },
  { idx: 3, label: 'U-right' },
  { idx: 4, label: 'O-left' },
  { idx: 5, label: 'O-middle' },
  { idx: 6, label: 'O-right' },
  { idx: 7, label: 'U-left+O-left' },
  { idx: 8, label: 'U-left+O-mid' },
  { idx: 9, label: 'U-left+O-right' },
  { idx: 10, label: 'U-mid+O-left' },
  { idx: 11, label: 'U-mid+O-mid' },
  { idx: 12, label: 'U-mid+O-right' },
  { idx: 13, label: 'U-right+O-left' },
  { idx: 14, label: 'U-right+O-mid' },
  { idx: 15, label: 'U-right+O-right' }
];

const STORAGE_KEY = 'font-inspector-settings';

export class FontInspector {
  private display: HTMLTextAreaElement | null;
  private categorySelect: HTMLSelectElement | null;
  private systemSelect: HTMLSelectElement | null;
  private sizeSelect: HTMLSelectElement | null;
  private infoDiv: HTMLElement | null;
  private unicodeDiv: HTMLElement | null;
  private currentCategory: string;
  private currentSystem: string;
  private currentFontSize: number;

  constructor() {
    this.display = document.getElementById('font-inspector-display') as HTMLTextAreaElement | null;
    this.categorySelect = document.getElementById('font-inspector-category') as HTMLSelectElement | null;
    this.systemSelect = document.getElementById('font-inspector-system') as HTMLSelectElement | null;
    this.sizeSelect = document.getElementById('font-inspector-size') as HTMLSelectElement | null;
    this.infoDiv = document.getElementById('font-inspector-info');
    this.unicodeDiv = document.getElementById('font-inspector-unicode');

    // Load saved settings or use defaults
    const saved = this.loadSettings();
    this.currentCategory = saved.category || 'base-pitches';
    this.currentSystem = saved.system || 'number';
    this.currentFontSize = saved.fontSize || 24;

    // Apply saved settings to UI
    if (this.categorySelect) this.categorySelect.value = this.currentCategory;
    if (this.systemSelect) this.systemSelect.value = this.currentSystem;
    if (this.sizeSelect) this.sizeSelect.value = String(this.currentFontSize);
    if (this.display) this.display.style.fontSize = `${this.currentFontSize}pt`;

    this.setupEventListeners();
  }

  loadSettings(): { category?: string; system?: string; fontSize?: number } {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  saveSettings(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        category: this.currentCategory,
        system: this.currentSystem,
        fontSize: this.currentFontSize
      }));
    } catch (e) {
      // Ignore storage errors
    }
  }

  setupEventListeners(): void {
    this.categorySelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.currentCategory = target.value;
      this.saveSettings();
      this.updateDisplay();
    });

    this.systemSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.currentSystem = target.value;
      this.saveSettings();
      this.updateDisplay();
    });

    this.sizeSelect?.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.currentFontSize = parseInt(target.value);
      this.saveSettings();
      if (this.display) {
        this.display.style.fontSize = `${this.currentFontSize}pt`;
      }
    });

    // Character inspection on click
    this.display?.addEventListener('click', () => {
      if (!this.display) return;
      const pos = this.display.selectionStart;
      const text = this.display.value;
      if (pos >= 0 && pos < text.length) {
        const char = text[pos];
        this.showCharacterInfo(char, pos);
      }
    });

    // Also update on selection change
    this.display?.addEventListener('select', () => {
      if (!this.display) return;
      const pos = this.display.selectionStart;
      const text = this.display.value;
      if (pos >= 0 && pos < text.length) {
        const char = text[pos];
        this.showCharacterInfo(char, pos);
      }
    });
  }

  showCharacterInfo(char: string, position: number): void {
    const codepoint = char.codePointAt(0);
    if (codepoint === undefined) return;

    const hex = `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
    const dec = codepoint;
    const isPUA = codepoint >= 0xE000;

    const description = this.describeCodepoint(codepoint);

    if (this.unicodeDiv) {
      this.unicodeDiv.innerHTML = `
        <span class="font-bold">${hex}</span> (dec: ${dec})
        <span class="mx-2">|</span>
        <span style="font-family: 'NotationFont', monospace; font-size: 20pt;">${char}</span>
        <span class="mx-2">|</span>
        <span class="${isPUA ? 'text-purple-600' : 'text-gray-600'}">${description}</span>
      `;
    }
  }

  describeCodepoint(cp: number): string {
    // Check each system for note glyphs
    for (const [name, sys] of Object.entries(PUA.systems)) {
      const chars = sys.chars;
      const numChars = chars.length;
      const totalGlyphs = numChars * sys.variantsPerChar;

      if (cp >= sys.base && cp < sys.base + totalGlyphs) {
        const offset = cp - sys.base;
        // Formula: cp = base + (charIdx × 30) + variantIdx
        // variantIdx = (accType × 5) + octaveIdx
        const charIdx = Math.floor(offset / sys.variantsPerChar);
        const variantIdx = offset % sys.variantsPerChar;
        const baseChar = chars[charIdx];

        // Decode variant: variantIdx = (accType × 5) + octaveIdx
        const accidentalIdx = Math.floor(variantIdx / 5);
        const octaveIdx = variantIdx % 5;

        const accidental = ACCIDENTALS[accidentalIdx]?.name || 'unknown';
        const octave = OCTAVE_ORDER[octaveIdx]?.shift ?? 0;

        return `${name} system: ${baseChar} ${accidental} oct${octave >= 0 ? '+' : ''}${octave}`;
      }
    }

    // Check line variants
    if (cp >= 0x1A000 && cp < 0x20000) {
      for (const [name, config] of Object.entries(PUA.noteLineVariants)) {
        if (cp >= config.base && cp < config.base + config.noteCount * 15) {
          const offset = cp - config.base;
          const noteIdx = Math.floor(offset / 15);
          const lineVariant = offset % 15;
          return `${name} line variant: note #${noteIdx}, ${LINE_VARIANTS[lineVariant]?.label}`;
        }
      }
    }

    // Check superscripts
    if (cp >= 0xF8000) {
      for (const [name, config] of Object.entries(PUA.superscripts)) {
        if (name === 'ascii') {
          const charCount = config.charCount || 0;
          if (cp >= config.base && cp < config.base + charCount * 16) {
            const offset = cp - config.base;
            const charIdx = Math.floor(offset / 16);
            const lineVariant = offset % 16;
            const srcChar = String.fromCharCode(0x20 + charIdx);
            return `superscript ASCII '${srcChar}', ${SUPERSCRIPT_LINE_VARIANTS[lineVariant]?.label}`;
          }
        } else {
          const chars = config.chars || 0;
          const variantsPerChar = config.variantsPerChar || 0;
          const totalGlyphs = chars * variantsPerChar * 16;
          if (cp >= config.base && cp < config.base + totalGlyphs) {
            const offset = cp - config.base;
            const noteIdx = Math.floor(offset / 16);
            const lineVariant = offset % 16;
            return `superscript ${name}: note #${noteIdx}, ${SUPERSCRIPT_LINE_VARIANTS[lineVariant]?.label}`;
          }
        }
      }
    }

    // Check notation elements
    for (const [name, elem] of Object.entries(PUA.notationElements)) {
      if (cp === elem.base) {
        return `notation element: ${name}`;
      }
      if (cp >= elem.lineBase && cp < elem.lineBase + 15) {
        const lineVar = cp - elem.lineBase;
        return `notation element: ${name} with ${LINE_VARIANTS[lineVar]?.label}`;
      }
    }

    // ASCII printable line variants
    if (cp >= 0xE800 && cp < 0xEE00) {
      return 'ASCII line variant (underline/overline)';
    }

    if (cp < 0x80) {
      return `ASCII: '${String.fromCodePoint(cp)}'`;
    }

    return 'PUA glyph';
  }

  updateDisplay(): void {
    const content = this.generateContent();
    if (this.display) {
      this.display.value = content.text;
    }
    if (this.infoDiv) {
      this.infoDiv.innerHTML = content.info;
    }
  }

  generateContent(): ContentResult {
    switch (this.currentCategory) {
      case 'base-pitches':
        return this.generateBasePitches();
      case 'pitches-accidentals':
        return this.generatePitchesWithAccidentals();
      case 'octave-variants':
        return this.generateOctaveVariants();
      case 'accidentals':
        return this.generateAccidentals();
      case 'underlines':
        return this.generateUnderlines();
      case 'slurs':
        return this.generateSlurs();
      case 'superscripts':
        return this.generateSuperscripts();
      case 'symbols':
        return this.generateSymbols();
      case 'notation-elements':
        return this.generateNotationElements();
      case 'example-beats':
        return this.generateExampleBeats();
      default:
        return { text: '', info: 'Unknown category' };
    }
  }

  generateBasePitches(): ContentResult {
    const sys = PUA.systems[this.currentSystem];
    if (!sys) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Base Pitches</strong> - ${this.currentSystem}<br>`;
    info += 'Natural accidental, octave 0. Click any character for Unicode details.';

    // Show selected system only
    text += `${this.currentSystem} (${sys.chars.length} chars): `;

    for (let i = 0; i < sys.chars.length; i++) {
      // Natural (accidental 0), octave 0 (octave idx 0) = variant 0
      const cp = sys.base + (i * sys.variantsPerChar) + 0;
      text += String.fromCodePoint(cp);
    }
    text += `\n  → ${sys.description}\n`;

    return { text, info };
  }

  generatePitchesWithAccidentals(): ContentResult {
    const sys = PUA.systems[this.currentSystem];
    if (!sys) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Pitches + Accidentals</strong> - ${this.currentSystem}<br>`;
    info += 'Each pitch with all accidentals inline (octave 0). Format: 1 1♯ 1♭ 1𝄪 1𝄫';

    // Accidental order for inline display: natural, sharp, flat, double-sharp, double-flat, half-flat
    const inlineAccidentals = [
      ACCIDENTALS[0], // natural (typeIdx 0)
      ACCIDENTALS[5], // sharp (typeIdx 5)
      ACCIDENTALS[1], // flat (typeIdx 1)
      ACCIDENTALS[4], // double-sharp (typeIdx 4)
      ACCIDENTALS[3], // double-flat (typeIdx 3)
      ACCIDENTALS[2]  // half-flat (typeIdx 2)
    ];

    for (let i = 0; i < sys.chars.length; i++) {
      for (const acc of inlineAccidentals) {
        // Formula: cp = base + (charIdx × 30) + (accTypeIdx × 5) + octaveIdx
        const variantIdx = (acc.typeIdx * 5) + 0; // octave 0
        const cp = sys.base + (i * sys.variantsPerChar) + variantIdx;
        text += String.fromCodePoint(cp);
      }
      text += ' ';
    }

    return { text, info };
  }

  generateOctaveVariants(): ContentResult {
    const sys = PUA.systems[this.currentSystem];
    if (!sys) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Octave Variants</strong> - ${this.currentSystem} (${sys.chars.length} chars × 5 octaves)<br>`;
    info += 'Rows: none, upper, lower, highest, lowest';

    // atoms.yaml octave indices: 0=base, 1=-2, 2=-1, 3=+1, 4=+2
    // Display order: none(0), upper(+1), lower(-1), highest(+2), lowest(-2)
    const octaveRows = [
      { idx: 0, label: 'none' },
      { idx: 3, label: 'upper' },
      { idx: 2, label: 'lower' },
      { idx: 4, label: 'highest' },
      { idx: 1, label: 'lowest' }
    ];

    for (const oct of octaveRows) {
      for (let i = 0; i < sys.chars.length; i++) {
        const variantIdx = oct.idx; // Natural accidental
        const cp = sys.base + (i * sys.variantsPerChar) + variantIdx;
        text += String.fromCodePoint(cp);
      }
      text += '\n';
    }

    return { text, info };
  }

  generateAccidentals(): ContentResult {
    const sys = PUA.systems[this.currentSystem];
    if (!sys) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Accidentals</strong> - ${this.currentSystem} (${sys.chars.length} chars × 6 accidentals)<br>`;
    info += 'Rows: none, flat, sharp, half-flat, bb, ## (all at octave 0)';

    // Display order: none, flat, sharp, half-flat, double-flat, double-sharp
    const accidentalOrder = [
      ACCIDENTALS[0], // natural (typeIdx 0)
      ACCIDENTALS[1], // flat (typeIdx 1)
      ACCIDENTALS[5], // sharp (typeIdx 5)
      ACCIDENTALS[2], // half-flat (typeIdx 2)
      ACCIDENTALS[3], // double-flat (typeIdx 3)
      ACCIDENTALS[4]  // double-sharp (typeIdx 4)
    ];

    for (const acc of accidentalOrder) {
      for (let i = 0; i < sys.chars.length; i++) {
        // Formula: cp = base + (charIdx × 30) + (accTypeIdx × 5) + octaveIdx
        const variantIdx = (acc.typeIdx * 5) + 0; // octave 0
        const cp = sys.base + (i * sys.variantsPerChar) + variantIdx;
        text += String.fromCodePoint(cp);
      }
      text += '\n';
    }

    return { text, info };
  }

  generateUnderlines(): ContentResult {
    const sys = PUA.systems[this.currentSystem];
    const lineConfig = PUA.noteLineVariants[this.currentSystem];
    if (!sys || !lineConfig) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Underlines (Beat Grouping)</strong> - ${this.currentSystem}<br>`;
    info += 'Left/mid/right connect to form continuous lines under beats';

    // Helper to get note with underline variant
    // Formula from atoms.yaml: line_cp = line_base + (note_offset × 15) + variant_index
    // For natural/octave0 notes: note_offset = charIdx * 30
    const noteU = (charIdx: number, variant: number): string => {
      const noteOffset = charIdx * sys.variantsPerChar;
      const cp = lineConfig.base + (noteOffset * 15) + variant;
      return String.fromCodePoint(cp);
    };

    // atoms.yaml indices: 0=U-mid, 1=U-left, 2=U-right
    const U_MID = 0, U_LEFT = 1, U_RIGHT = 2;

    // Get dash with underline from notation elements (same formula as notes)
    // Formula: line_base + variant (dash has only one glyph, so no offset)
    const dashLineBase = PUA.notationElements.dash.lineBase;
    const dashU = (variant: number): string => String.fromCodePoint(dashLineBase + variant);

    // Row 1: left glyphs + examples (12, 1-3)
    for (let i = 0; i < sys.chars.length; i++) text += noteU(i, U_LEFT);
    text += '  ' + noteU(0, U_LEFT) + noteU(1, U_RIGHT);
    text += '  ' + noteU(0, U_LEFT) + dashU(U_MID) + noteU(2, U_RIGHT) + '\n';

    // Row 2: mid glyphs + examples (123, 1--4)
    for (let i = 0; i < sys.chars.length; i++) text += noteU(i, U_MID);
    text += '  ' + noteU(0, U_LEFT) + noteU(1, U_MID) + noteU(2, U_RIGHT);
    text += '  ' + noteU(0, U_LEFT) + dashU(U_MID) + dashU(U_MID) + noteU(3, U_RIGHT) + '\n';

    // Row 3: right glyphs + examples (1234, --12)
    for (let i = 0; i < sys.chars.length; i++) text += noteU(i, U_RIGHT);
    text += '  ' + noteU(0, U_LEFT) + noteU(1, U_MID) + noteU(2, U_MID) + noteU(3, U_RIGHT);
    text += '  ' + dashU(U_LEFT) + dashU(U_MID) + noteU(0, U_MID) + noteU(1, U_RIGHT) + '\n';

    return { text, info };
  }

  generateSlurs(): ContentResult {
    const sys = PUA.systems[this.currentSystem];
    const lineConfig = PUA.noteLineVariants[this.currentSystem];
    if (!sys || !lineConfig) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Slurs (Overlines)</strong> - ${this.currentSystem}<br>`;
    info += 'Left/mid/right connect to form slur lines over notes';

    // Helper to get note with overline variant
    const noteO = (charIdx: number, variant: number): string => {
      const noteOffset = charIdx * sys.variantsPerChar;
      const cp = lineConfig.base + (noteOffset * 15) + variant;
      return String.fromCodePoint(cp);
    };

    // atoms.yaml indices: 3=O-mid, 4=O-left, 5=O-right
    const O_MID = 3, O_LEFT = 4, O_RIGHT = 5;

    // Row 1: left glyphs + examples (12, 123)
    for (let i = 0; i < sys.chars.length; i++) text += noteO(i, O_LEFT);
    text += '  ' + noteO(0, O_LEFT) + noteO(1, O_RIGHT);
    text += '  ' + noteO(0, O_LEFT) + noteO(1, O_MID) + noteO(2, O_RIGHT) + '\n';

    // Row 2: mid glyphs + examples (1234, 12345)
    for (let i = 0; i < sys.chars.length; i++) text += noteO(i, O_MID);
    text += '  ' + noteO(0, O_LEFT) + noteO(1, O_MID) + noteO(2, O_MID) + noteO(3, O_RIGHT);
    text += '  ' + noteO(0, O_LEFT) + noteO(1, O_MID) + noteO(2, O_MID) + noteO(3, O_MID) + noteO(4, O_RIGHT) + '\n';

    // Row 3: right glyphs + examples (overlapping slurs: 1-2 3-4)
    for (let i = 0; i < sys.chars.length; i++) text += noteO(i, O_RIGHT);
    text += '  ' + noteO(0, O_LEFT) + noteO(1, O_RIGHT) + ' ' + noteO(2, O_LEFT) + noteO(3, O_RIGHT);
    text += '  ' + noteO(0, O_LEFT) + noteO(1, O_MID) + noteO(2, O_RIGHT) + ' ' + noteO(3, O_LEFT) + noteO(4, O_RIGHT) + '\n';

    return { text, info };
  }

  generateSuperscripts(): ContentResult {
    const superConfig = PUA.superscripts[this.currentSystem];
    if (!superConfig) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Superscripts (Grace Notes)</strong> - ${this.currentSystem}<br>`;
    info += '50% scaled glyphs, 16 line variants each';

    const sys = PUA.systems[this.currentSystem];

    // Row 1: base superscripts (no lines)
    for (let i = 0; i < sys.chars.length; i++) {
      const sourceOffset = i * (superConfig.variantsPerChar || 0);
      const cp = superConfig.base + (sourceOffset * 16) + 0;
      text += String.fromCodePoint(cp);
    }
    text += '\n';

    // Row 2: first char with all 16 line variants
    const sourceOffset = 0;
    for (let v = 0; v < 16; v++) {
      const cp = superConfig.base + (sourceOffset * 16) + v;
      text += String.fromCodePoint(cp);
    }
    text += '\n';

    // Row 3: ASCII superscripts (dash, numbers)
    const asciiChars = '-0123456789';
    for (const ch of asciiChars) {
      const charIdx = ch.charCodeAt(0) - 0x20;
      const cp = PUA.superscripts.ascii.base + (charIdx * 16) + 0;
      text += String.fromCodePoint(cp);
    }

    return { text, info };
  }

  generateSymbols(): ContentResult {
    let text = '';
    let info = '<strong>Symbols</strong> - SMuFL barlines and ornaments<br>';
    info += 'From Noto Music font. Click for Unicode details.';

    // Try to get symbols from WASM font config
    const fontConfig = (window as any).editor?.wasmModule?.getFontConfig?.();

    if (fontConfig?.symbols) {
      const barlines = fontConfig.symbols.filter(s => s.name.startsWith('barline'));
      const ornaments = fontConfig.symbols.filter(s => s.name.startsWith('ornament'));
      const accidentals = fontConfig.symbols.filter(s => s.name.startsWith('accidental'));

      // Barlines row
      for (const s of barlines) text += String.fromCodePoint(s.codepoint);
      text += '\n';

      // Ornaments row
      for (const s of ornaments) text += String.fromCodePoint(s.codepoint);
      text += '\n';

      // Accidentals row
      for (const s of accidentals) text += String.fromCodePoint(s.codepoint);
      text += '\n';
    } else {
      // Fallback: barlines
      text += String.fromCodePoint(0x1D100) + String.fromCodePoint(0x1D101);
      text += String.fromCodePoint(0x1D106) + String.fromCodePoint(0x1D107) + '\n';

      // Ornaments
      text += String.fromCodePoint(0xE566) + String.fromCodePoint(0xE567);
      text += String.fromCodePoint(0xE56D) + String.fromCodePoint(0xE56E) + '\n';
    }

    // Utility glyphs row
    text += String.fromCodePoint(PUA.utility.loopBottomLeft);
    text += String.fromCodePoint(PUA.utility.loopBottomRight);
    text += String.fromCodePoint(PUA.utility.loopTopLeft);
    text += String.fromCodePoint(PUA.utility.loopTopRight);

    return { text, info };
  }

  generateNotationElements(): ContentResult {
    let text = '';
    let info = '<strong>Notation Elements</strong> - Non-pitched symbols<br>';
    info += 'Dash, breath mark, space, barlines. Click for Unicode details.';

    // Row 1: base elements
    for (const [name, elem] of Object.entries(PUA.notationElements)) {
      text += String.fromCodePoint(elem.base);
    }
    text += '\n';

    // Row 2: dash with underline variants (left, mid, right)
    const dashElem = PUA.notationElements.dash;
    for (const v of [1, 0, 2]) { // left, mid, right
      text += String.fromCodePoint(dashElem.lineBase + v);
    }
    text += '\n';

    // Row 3: breath mark with underline variants
    const breathElem = PUA.notationElements.breathMark;
    for (const v of [1, 0, 2]) {
      text += String.fromCodePoint(breathElem.lineBase + v);
    }

    return { text, info };
  }

  generateExampleBeats(): ContentResult {
    const sys = PUA.systems[this.currentSystem];
    const lineConfig = PUA.noteLineVariants[this.currentSystem];
    if (!sys || !lineConfig) return { text: 'Invalid system', info: '' };

    let text = '';
    let info = `<strong>Example Beats</strong> - ${this.currentSystem}<br>`;
    info += 'Subdivisions, slurs, combined, grace notes';

    // Helper to get a note with line variant
    const noteWithLine = (charIdx: number, lineVariant: number): string => {
      const noteOffset = charIdx * sys.variantsPerChar;
      const cp = lineConfig.base + (noteOffset * 15) + lineVariant;
      return String.fromCodePoint(cp);
    };

    // Helper to get base note
    const baseNote = (charIdx: number): string => {
      const cp = sys.base + (charIdx * sys.variantsPerChar);
      return String.fromCodePoint(cp);
    };

    // U-left=1, U-mid=0, U-right=2, O-mid=3, O-left=4, O-right=5

    // Row 1: subdivisions (2, 3, 4 notes)
    text += noteWithLine(0, 1) + noteWithLine(1, 2) + '  ';
    text += noteWithLine(0, 1) + noteWithLine(1, 0) + noteWithLine(2, 2) + '  ';
    text += noteWithLine(0, 1) + noteWithLine(1, 0) + noteWithLine(2, 0) + noteWithLine(3, 2) + '\n';

    // Row 2: slurs (2, 3, 4 notes)
    text += noteWithLine(0, 4) + noteWithLine(1, 5) + '  ';
    text += noteWithLine(0, 4) + noteWithLine(1, 3) + noteWithLine(2, 5) + '  ';
    text += noteWithLine(0, 4) + noteWithLine(1, 3) + noteWithLine(2, 3) + noteWithLine(3, 5) + '\n';

    // Row 3: combined (slurred subdivisions)
    text += noteWithLine(0, 10) + noteWithLine(1, 14) + '  ';
    text += noteWithLine(0, 10) + noteWithLine(1, 6) + noteWithLine(2, 14) + '  ';
    text += noteWithLine(0, 10) + noteWithLine(1, 6) + noteWithLine(2, 6) + noteWithLine(3, 14) + '\n';

    // Row 4: grace notes
    const superConfig = PUA.superscripts[this.currentSystem];
    if (superConfig) {
      const grace = (charIdx: number): string => {
        const sourceOffset = charIdx * (superConfig.variantsPerChar || 0);
        return String.fromCodePoint(superConfig.base + (sourceOffset * 16) + 0);
      };
      text += grace(0) + baseNote(1) + '  ';
      text += grace(0) + grace(1) + baseNote(2) + '  ';
      text += grace(0) + noteWithLine(1, 1) + noteWithLine(2, 2) + '\n';
    }

    // Row 5: scale
    for (let i = 0; i < Math.min(sys.chars.length, 8); i++) {
      text += baseNote(i);
    }

    return { text, info };
  }

  initialize(): void {
    this.updateDisplay();
    logger.info(LOG_CATEGORIES.UI, 'FontInspector initialized');
  }
}

// Initialize when DOM is ready
export function initFontInspector(): void {
  const inspector = new FontInspector();
  inspector.initialize();
  (window as any).fontInspector = inspector;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[FontInspector] DOMContentLoaded, initializing...');
    initFontInspector();
  });
} else {
  // DOM already loaded, wait for WASM to be ready
  console.log('[FontInspector] DOM ready, waiting for WASM...');
  const waitForWasm = async (): Promise<void> => {
    let attempts = 0;
    while (!(window as any).editor?.wasmModule && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    console.log('[FontInspector] Initializing after WASM wait...');
    initFontInspector();
  };
  waitForWasm();
}
