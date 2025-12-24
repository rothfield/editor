/**
 * Font Test UI - Display all custom glyphs in NotationFont (from Noto Music)
 *
 * IMPORTANT: Font constants are loaded from Rust at runtime via getFontConfig()
 * This ensures JavaScript always uses the correct code points from build.rs
 * regardless of changes to atoms.yaml or font generation.
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
  all_chars?: string;
}

interface PitchSystemInfo {
  display_name: string;
  characters: string;
  description: string;
  pua_base?: number;
  variants_per_character?: number;
}

interface OctaveVariant {
  shift: number;
  label: string;
}

// Font configuration loaded from WASM only (single source of truth)
let fontConfig: FontConfig | null = null;

// Notation system definitions (from atoms.yaml)
const PITCH_SYSTEMS: { [key: string]: PitchSystemInfo } = {
  number: {
    display_name: "Number System",
    characters: "1234567",
    description: "Numerical scale degrees (1-7)"
  },
  western: {
    display_name: "Western Letter Names",
    characters: "CDEFGABcdefgab",
    description: "Standard A-B-C-D-E-F-G notation (uppercase + lowercase)"
  },
  sargam: {
    display_name: "Sargam (Indian Classical)",
    characters: "SrRgGmMPdDnN",
    description: "Indian classical music notation (Sa Re Ga Ma Pa Dha Ni)"
  },
  doremi: {
    display_name: "Doremi (Solfège)",
    characters: "drmfsltDRMFSLT",
    description: "Solfège notation (do-re-mi-fa-sol-la-ti)"
  }
};

// Octave variants mapping
// Octave variants - MUST match Rust octave_index() order in font_lookup_tables.rs
// Index 0: octave 0 (base), Index 1: octave -2, Index 2: octave -1, Index 3: octave +1, Index 4: octave +2
const OCTAVE_VARIANTS: OctaveVariant[] = [
  { shift: 0, label: "(natural - octave 0)" },     // Index 0
  { shift: -2, label: "2 dots below (octave -2)" }, // Index 1
  { shift: -1, label: "1 dot below (octave -1)" },  // Index 2
  { shift: 1, label: "1 dot above (octave +1)" },   // Index 3
  { shift: 2, label: "2 dots above (octave +2)" }   // Index 4
];

// Initialize font config from WASM (single source of truth)
async function initFontConfig(): Promise<boolean> {
  try {
    // Wait for editor to be fully initialized (max 10 seconds)
    let attempts = 0;
    while (!(window as any).editor?.wasmModule?.getFontConfig && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    // Get font config from WASM (includes systems + symbols)
    const config = (window as any).editor?.wasmModule?.getFontConfig?.();

    if (!config) {
      throw new Error('FATAL: getFontConfig not available after waiting for editor initialization. WASM module failed to load properly.');
    }

    fontConfig = config;
    logger.info(LOG_CATEGORIES.WASM, 'Font config loaded from WASM', { fontConfig });
    return true;
  } catch (e) {
    logger.error(LOG_CATEGORIES.WASM, 'Error loading font config', { error: e });
    return false;
  }
}

export class FontTestUI {
  private grid: HTMLElement | null;
  private showAllBtn: HTMLElement | null;
  private tableBtn: HTMLElement | null;
  private fontSizeSelector: HTMLSelectElement | null;
  private currentFontSize: number = 20;

  constructor() {
    this.grid = document.getElementById('font-test-grid');
    this.showAllBtn = document.getElementById('font-test-show-all');
    this.tableBtn = document.getElementById('font-test-show-table');
    this.fontSizeSelector = document.getElementById('font-test-size') as HTMLSelectElement | null;

    this.setupEventListeners();
  }

  setupEventListeners(): void {
    this.showAllBtn?.addEventListener('click', () => this.showComprehensiveView());
    this.tableBtn?.addEventListener('click', () => this.showUnicodeTable());
    this.fontSizeSelector?.addEventListener('change', (e) => this.handleFontSizeChange(e));
  }

  handleFontSizeChange(e: Event): void {
    const target = e.target as HTMLSelectElement;
    this.currentFontSize = parseInt(target.value);
    // Re-render the current view with new font size
    const currentView = this.grid?.querySelector('.mb-6') ? 'comprehensive' : 'table';
    if (currentView === 'comprehensive') {
      this.showComprehensiveView();
    } else {
      this.showUnicodeTable();
    }
  }

  showComprehensiveView(): void {
    if (!this.grid) return;
    this.grid.innerHTML = '';

    // 1. Display symbols first (from WASM - single source of truth)
    if (fontConfig?.symbols && fontConfig.symbols.length > 0) {
      this.addSymbolsFromWasm();
    } else {
      logger.warn(LOG_CATEGORIES.WASM, 'No symbols found in WASM font config');
    }

    // 2. Base pitches with accidentals (compact, no labels)
    this.addBasePitchesSection();

    // 3. Example beats with beat grouping (underlines)
    this.addBeatGroupingExamples();

    // 4. Superscripts with base note prefix
    this.addSuperscriptsSection();

    // 5. Display each pitch system with all variants (including accidentals)
    for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
      this.addPitchSystemSection(systemKey, systemInfo);
    }
  }

  addSymbolsFromWasm(): void {
    // Group symbols by type (barline vs ornament) based on name prefix
    const barlines: Array<{ cp: number; label: string }> = [];
    const ornaments: Array<{ cp: number; label: string }> = [];

    if (!fontConfig?.symbols) return;

    for (const symbol of fontConfig.symbols) {
      if (symbol.name.startsWith('barline')) {
        barlines.push({ cp: symbol.codepoint, label: symbol.label });
      } else if (symbol.name.startsWith('ornament')) {
        ornaments.push({ cp: symbol.codepoint, label: symbol.label });
      }
    }

    // Display barlines
    if (barlines.length > 0) {
      this.addSymbolSection('Barlines & Repeat Markers', barlines);
    }

    // Display ornaments
    if (ornaments.length > 0) {
      this.addSymbolSection('Ornaments', ornaments);
    }
  }

  /**
   * Add base pitches with accidentals section (compact, no individual labels)
   */
  addBasePitchesSection(): void {
    if (!this.grid) return;

    const section = document.createElement('div');
    section.className = 'mb-6 border-b-2 border-gray-200 pb-6';

    const heading = document.createElement('h3');
    heading.className = 'text-lg font-bold text-gray-800 mb-4';
    heading.textContent = 'Base Pitches + Accidentals';
    section.appendChild(heading);

    // Get number system config (use as reference)
    const systemConfig = fontConfig?.systems?.find(s => s.system_name === 'number');
    if (!systemConfig) return;

    const characters = PITCH_SYSTEMS.number.characters;
    const numChars = characters.length;

    // Accidental types - MUST match build.rs
    const accidentalTypes = [
      { name: '', blockOffset: 0 },        // Natural
      { name: '♭', blockOffset: 5 },       // Flat
      { name: '♯', blockOffset: 25 },      // Sharp
      { name: '𝄫', blockOffset: 15 },      // Double-flat
      { name: '𝄪', blockOffset: 20 }       // Double-sharp
    ];

    const pitchGrid = document.createElement('div');
    pitchGrid.className = 'flex flex-wrap gap-2';
    pitchGrid.style.fontFamily = "'NotationFont', monospace";
    pitchGrid.style.fontSize = `${this.currentFontSize}pt`;

    // For each pitch, show natural and accidentals inline
    for (let charIdx = 0; charIdx < characters.length; charIdx++) {
      for (const acc of accidentalTypes) {
        // Base octave (octave_idx = 0)
        const cp = systemConfig.pua_base + (acc.blockOffset * numChars) + charIdx;
        const glyphSpan = document.createElement('span');
        glyphSpan.textContent = String.fromCodePoint(cp);
        glyphSpan.title = `${characters[charIdx]}${acc.name} U+${cp.toString(16).toUpperCase()}`;
        glyphSpan.className = 'cursor-pointer hover:bg-blue-100 px-1';
        pitchGrid.appendChild(glyphSpan);
      }
      // Add small gap between pitch groups
      const spacer = document.createElement('span');
      spacer.textContent = ' ';
      spacer.className = 'mx-1';
      pitchGrid.appendChild(spacer);
    }

    section.appendChild(pitchGrid);
    this.grid.appendChild(section);
  }

  /**
   * Add example beats with beat grouping (underlines/lower loops)
   */
  addBeatGroupingExamples(): void {
    if (!this.grid) return;

    const section = document.createElement('div');
    section.className = 'mb-6 border-b-2 border-gray-200 pb-6';

    const heading = document.createElement('h3');
    heading.className = 'text-lg font-bold text-gray-800 mb-4';
    heading.textContent = 'Beat Grouping (Lower Loops)';
    section.appendChild(heading);

    const description = document.createElement('p');
    description.className = 'text-sm text-gray-600 mb-4';
    description.textContent = 'Notes in the same beat are connected with underlines (lower loops).';
    section.appendChild(description);

    // Get number system config
    const systemConfig = fontConfig?.systems?.find(s => s.system_name === 'number');
    if (!systemConfig) return;

    const examples = document.createElement('div');
    examples.className = 'space-y-4';
    examples.style.fontFamily = "'NotationFont', monospace";
    examples.style.fontSize = `${this.currentFontSize}pt`;

    // Example 1: Two-note beat  "12" with underline
    const example1 = document.createElement('div');
    example1.className = 'flex items-center gap-4';
    example1.innerHTML = `
      <span class="text-sm text-gray-600 w-32">Two-note beat:</span>
      <span class="beat-example">
        ${this.getUnderlinedRun([0, 1], systemConfig)}
      </span>
    `;
    examples.appendChild(example1);

    // Example 2: Three-note beat "123" with underline
    const example2 = document.createElement('div');
    example2.className = 'flex items-center gap-4';
    example2.innerHTML = `
      <span class="text-sm text-gray-600 w-32">Three-note beat:</span>
      <span class="beat-example">
        ${this.getUnderlinedRun([0, 1, 2], systemConfig)}
      </span>
    `;
    examples.appendChild(example2);

    // Example 3: Four-note beat "1234" with underline
    const example3 = document.createElement('div');
    example3.className = 'flex items-center gap-4';
    example3.innerHTML = `
      <span class="text-sm text-gray-600 w-32">Four-note beat:</span>
      <span class="beat-example">
        ${this.getUnderlinedRun([0, 1, 2, 3], systemConfig)}
      </span>
    `;
    examples.appendChild(example3);

    // Example 4: Mixed beats "12 34 567" (spaces separate beats)
    const example4 = document.createElement('div');
    example4.className = 'flex items-center gap-4';
    example4.innerHTML = `
      <span class="text-sm text-gray-600 w-32">Mixed beats:</span>
      <span class="beat-example">
        ${this.getUnderlinedRun([0, 1], systemConfig)} ${this.getUnderlinedRun([2, 3], systemConfig)} ${this.getUnderlinedRun([4, 5, 6], systemConfig)}
      </span>
    `;
    examples.appendChild(example4);

    section.appendChild(examples);
    this.grid.appendChild(section);
  }

  /**
   * Get a run of notes with underline (beat grouping)
   */
  getUnderlinedRun(charIndices: number[], systemConfig: { pua_base: number }): string {
    if (charIndices.length === 0) return '';
    if (charIndices.length === 1) {
      // Single note - no underline needed
      const cp = systemConfig.pua_base + charIndices[0];
      return String.fromCodePoint(cp);
    }

    // Line variant encoding (from atoms.yaml line_variant_config):
    // 0=underline-middle, 1=underline-left, 2=underline-right
    // Line variants are stored at: base + (30 * numChars) + (charIndex * 15) + variantIndex
    // But actually they use a different PUA range - let me use the correct formula

    // For number system: line variants are in the 0x1A000 range
    // Formula: 0x1A000 + (charIndex × 15) + variantIndex
    const LINE_VARIANT_BASE = 0x1A000;
    const VARIANTS_PER_CHAR = 15;

    let result = '';
    for (let i = 0; i < charIndices.length; i++) {
      const charIdx = charIndices[i];
      let variantIdx: number;
      if (i === 0) {
        variantIdx = 1; // Left
      } else if (i === charIndices.length - 1) {
        variantIdx = 2; // Right
      } else {
        variantIdx = 0; // Middle
      }
      const cp = LINE_VARIANT_BASE + (charIdx * VARIANTS_PER_CHAR) + variantIdx;
      result += String.fromCodePoint(cp);
    }
    return result;
  }

  /**
   * Add superscripts section with base note prefix for size comparison
   */
  addSuperscriptsSection(): void {
    if (!this.grid) return;

    const section = document.createElement('div');
    section.className = 'mb-6 border-b-2 border-gray-200 pb-6';

    const heading = document.createElement('h3');
    heading.className = 'text-lg font-bold text-gray-800 mb-4';
    heading.textContent = 'Superscripts (Grace Notes)';
    section.appendChild(heading);

    const description = document.createElement('p');
    description.className = 'text-sm text-gray-600 mb-4';
    description.textContent = 'Each run shows a base note followed by superscript variants for size comparison.';
    section.appendChild(description);

    // Get number system config
    const systemConfig = fontConfig?.systems?.find(s => s.system_name === 'number');
    if (!systemConfig) return;

    const characters = PITCH_SYSTEMS.number.characters;
    const numChars = characters.length;

    // Superscript base for number system: 0xF8600
    // Formula: 0xF8600 + (charIndex × 16) + lineVariant
    const SUPERSCRIPT_NUMBER_BASE = 0xF8600;
    const SUPER_VARIANTS_PER_CHAR = 16;

    const examples = document.createElement('div');
    examples.className = 'space-y-3';
    examples.style.fontFamily = "'NotationFont', monospace";
    examples.style.fontSize = `${this.currentFontSize}pt`;

    // Show each pitch with its superscript version
    for (let charIdx = 0; charIdx < numChars; charIdx++) {
      const row = document.createElement('div');
      row.className = 'flex items-baseline gap-2';

      // Base note (normal size)
      const baseCp = systemConfig.pua_base + charIdx;
      const baseNote = document.createElement('span');
      baseNote.textContent = String.fromCodePoint(baseCp);
      baseNote.title = `Base: ${characters[charIdx]}`;

      // Superscript note (same pitch, smaller)
      const superCp = SUPERSCRIPT_NUMBER_BASE + (charIdx * SUPER_VARIANTS_PER_CHAR);
      const superNote = document.createElement('span');
      superNote.textContent = String.fromCodePoint(superCp);
      superNote.title = `Superscript: ${characters[charIdx]}`;

      // Create run: base + superscript
      row.appendChild(baseNote);
      row.appendChild(superNote);

      // Add spacing and label
      const label = document.createElement('span');
      label.className = 'text-xs text-gray-500 ml-4';
      label.textContent = `"${characters[charIdx]}" base + superscript`;
      row.appendChild(label);

      examples.appendChild(row);
    }

    // Add a full example with multiple grace notes
    const fullExample = document.createElement('div');
    fullExample.className = 'mt-4 pt-4 border-t border-gray-200';

    const fullLabel = document.createElement('p');
    fullLabel.className = 'text-sm text-gray-600 mb-2';
    fullLabel.textContent = 'Full example: Note with grace notes prefix';
    fullExample.appendChild(fullLabel);

    const fullRun = document.createElement('div');
    fullRun.style.fontFamily = "'NotationFont', monospace";
    fullRun.style.fontSize = `${this.currentFontSize}pt`;

    // Show: grace123 -> 4 (three grace notes leading to main note 4)
    let fullContent = '';
    // Three grace notes (1, 2, 3)
    for (let i = 0; i < 3; i++) {
      const superCp = SUPERSCRIPT_NUMBER_BASE + (i * SUPER_VARIANTS_PER_CHAR);
      fullContent += String.fromCodePoint(superCp);
    }
    // Main note (4)
    const mainCp = systemConfig.pua_base + 3; // "4"
    fullContent += String.fromCodePoint(mainCp);

    fullRun.textContent = fullContent;
    fullExample.appendChild(fullRun);

    section.appendChild(examples);
    section.appendChild(fullExample);
    this.grid.appendChild(section);
  }

  addPitchSystemSection(systemKey: string, systemInfo: PitchSystemInfo): void {
    if (!this.grid) return;

    const section = document.createElement('div');
    section.className = 'mb-6 border-b-2 border-gray-200 pb-6';

    // Section header
    const header = document.createElement('div');
    header.className = 'mb-4';
    header.innerHTML = `
      <h3 class="text-lg font-bold text-gray-800">${systemInfo.display_name}</h3>
      <p class="text-sm text-gray-600">${systemInfo.description}</p>
    `;
    section.appendChild(header);

    // Get characters for this system
    const characters = systemInfo.characters;

    // Get per-system PUA config from fontConfig.systems
    const systemConfig = fontConfig?.systems?.find(s => s.system_name === systemKey);
    if (!systemConfig) {
      logger.warn(LOG_CATEGORIES.WASM, `No PUA config found for system: ${systemKey}`);
      return;
    }

    // Create grid for this pitch system
    const pitchGrid = document.createElement('div');
    pitchGrid.className = 'space-y-4';
    section.appendChild(pitchGrid);

    // For each character, show all octave variants
    for (let charIndexInSystem = 0; charIndexInSystem < characters.length; charIndexInSystem++) {
      const char = characters[charIndexInSystem];
      const charContainer = document.createElement('div');
      charContainer.className = 'border border-gray-300 rounded-lg p-4 bg-gray-50';

      // Character label
      const charLabel = document.createElement('h4');
      charLabel.className = 'text-sm font-semibold text-gray-700 mb-3';
      charLabel.textContent = `"${char}" - Natural (octave 0)`;
      charContainer.appendChild(charLabel);

      // Grid for octave variants
      const variantGrid = document.createElement('div');
      variantGrid.className = 'grid grid-cols-4 gap-2 mb-3';

      // All octave variants (octave 0, -2, -1, +1, +2 at indices 0-4)
      // CRITICAL: Must match Rust octave_index() order in font_lookup_tables.rs
      for (let variantIdx = 0; variantIdx < OCTAVE_VARIANTS.length; variantIdx++) {
        const variant = OCTAVE_VARIANTS[variantIdx];
        const cp = systemConfig.pua_base + (charIndexInSystem * systemConfig.variants_per_character) + variantIdx;
        const label = `${char} ${variant.label}`;
        const item = this.createGlyphItem(cp, label, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
        variantGrid.appendChild(item);
      }

      charContainer.appendChild(variantGrid);

      // All accidentals for this character (sharp, flat, double-sharp, double-flat)
      // Each system gets 25 variants: 5 accidental types × 5 octave variants
      // Variant structure: 0-4 (natural), 5-9 (sharp), 10-14 (flat), 15-19 (double-sharp), 20-24 (double-flat)
      const accidentalsLabel = document.createElement('h4');
      accidentalsLabel.className = 'text-xs font-semibold text-gray-600 mt-3 mb-2';
      accidentalsLabel.textContent = 'With Accidentals (Per-System Variants - 5 types × 5 octaves)';
      charContainer.appendChild(accidentalsLabel);

      const accidentalsGrid = document.createElement('div');
      accidentalsGrid.className = 'grid grid-cols-4 gap-2';

      // CRITICAL: Must match build.rs calculate_system_codepoint() lines 441-449
      // For base octave (octave 0, octave_idx = 0):
      // Natural: offset 0, Flat: offset 5N, Half-flat: offset 10N,
      // Double-flat: offset 15N, Double-sharp: offset 20N, Sharp: offset 25N
      const numChars = characters.length;
      const accidentalTypes = [
        { name: '♭', blockOffset: 5, label: 'Flat' },
        { name: 'hf♭', blockOffset: 10, label: 'Half-flat' },
        { name: '𝄫', blockOffset: 15, label: 'Double-flat' },
        { name: '𝄪', blockOffset: 20, label: 'Double-sharp' },  // FIXED: was blockOffset 25
        { name: '♯', blockOffset: 25, label: 'Sharp' }  // FIXED: was blockOffset 20
      ];

      for (const accidental of accidentalTypes) {
        // Show base octave (octave 0, octave_idx = 0) for each accidental type
        // Formula: pua_base + (blockOffset × N) + (octave_idx × N) + char_idx
        const octave_idx = 0; // Base octave
        const cp = systemConfig.pua_base + (accidental.blockOffset * numChars) + (octave_idx * numChars) + charIndexInSystem;
        const accLabel = `${char}${accidental.name}`;
        const item = this.createGlyphItem(cp, accLabel, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
        accidentalsGrid.appendChild(item);
      }

      charContainer.appendChild(accidentalsGrid);

      pitchGrid.appendChild(charContainer);
    }

    this.grid.appendChild(section);
  }

  addSymbolSection(title: string, symbols: Array<{ cp: number; label: string }>): void {
    if (!this.grid) return;

    const section = document.createElement('div');
    section.className = 'mb-6 border-b-2 border-gray-200 pb-6';

    const heading = document.createElement('h3');
    heading.className = 'text-lg font-bold text-gray-800 mb-4';
    heading.textContent = title;
    section.appendChild(heading);

    const symbolGrid = document.createElement('div');
    symbolGrid.className = 'grid grid-cols-4 gap-3';

    for (const symbol of symbols) {
      const item = this.createGlyphItem(symbol.cp, symbol.label, `U+${symbol.cp.toString(16).toUpperCase().padStart(4, '0')}`);
      symbolGrid.appendChild(item);
    }

    section.appendChild(symbolGrid);
    this.grid.appendChild(section);
  }

  createGlyphItem(codepoint: number | string, label: string, cpDisplay?: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'font-test-glyph-item border border-gray-300 rounded p-3 text-center bg-white hover:bg-gray-100 transition-colors cursor-pointer';

    // Glyph display
    const glyphDiv = document.createElement('div');
    glyphDiv.className = 'font-test-glyph-display font-bold mb-2 text-center';
    glyphDiv.style.fontFamily = "'NotationFont', monospace";
    glyphDiv.style.fontSize = `${this.currentFontSize}pt`;
    glyphDiv.style.minHeight = '40px';
    glyphDiv.style.display = 'flex';
    glyphDiv.style.alignItems = 'center';
    glyphDiv.style.justifyContent = 'center';

    // Convert codepoint to character
    let glyphChar: string;
    if (typeof codepoint === 'number') {
      glyphChar = String.fromCodePoint(codepoint);
    } else if (typeof codepoint === 'string' && codepoint.length === 1) {
      glyphChar = codepoint;
    } else if (typeof codepoint === 'string') {
      glyphChar = codepoint;
    } else {
      glyphChar = String.fromCodePoint(codepoint as number);
    }
    glyphDiv.textContent = glyphChar;

    // Label
    const labelDiv = document.createElement('div');
    labelDiv.className = 'font-test-glyph-label text-xs text-gray-700 mb-1 font-semibold';
    labelDiv.textContent = label;

    // Codepoint display
    if (cpDisplay) {
      const cpDiv = document.createElement('div');
      cpDiv.className = 'font-test-glyph-codepoint text-xs font-mono text-blue-600';
      cpDiv.textContent = cpDisplay;
      item.appendChild(glyphDiv);
      item.appendChild(labelDiv);
      item.appendChild(cpDiv);
    } else {
      item.appendChild(glyphDiv);
      item.appendChild(labelDiv);
    }

    // Copy codepoint on click
    item.addEventListener('click', () => {
      let cp: number;
      if (typeof codepoint === 'number') {
        cp = codepoint;
      } else if (typeof codepoint === 'string' && codepoint.length === 1) {
        cp = codepoint.charCodeAt(0);
      } else {
        cp = (codepoint as string).charCodeAt(0);
      }
      const hex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
      navigator.clipboard.writeText(hex).then(() => {
        item.style.backgroundColor = '#d1fae5';
        setTimeout(() => {
          item.style.backgroundColor = '';
        }, 200);
      });
    });

    return item;
  }

  showUnicodeTable(): void {
    if (!this.grid) return;
    this.grid.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'mb-6';

    const heading = document.createElement('h3');
    heading.className = 'text-lg font-bold text-gray-800 mb-4';
    heading.textContent = 'Unicode Code Points to Pitch Mapping';
    section.appendChild(heading);

    // Create table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'overflow-x-auto border border-gray-300 rounded-lg';

    const table = document.createElement('table');
    table.className = 'w-full text-sm';

    // Table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr class="bg-gray-100 border-b-2 border-gray-300">
        <th class="px-4 py-2 text-left font-bold text-gray-700">Code Point</th>
        <th class="px-4 py-2 text-left font-bold text-gray-700">Glyph</th>
        <th class="px-4 py-2 text-left font-bold text-gray-700">Pitch/Symbol</th>
        <th class="px-4 py-2 text-left font-bold text-gray-700">Type</th>
        <th class="px-4 py-2 text-left font-bold text-gray-700">Description</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // Add all pitch character variants
    const allChars = fontConfig?.all_chars || '';
    for (let charIdx = 0; charIdx < allChars.length; charIdx++) {
      const char = allChars[charIdx];
      const systemName = this.getCharacterSystem(char);

      // Get the system config for this character
      const systemConfig = this.getSystemConfigForChar(char);
      if (!systemConfig) continue;

      // Calculate character index within its system
      const charIndexInSystem = systemConfig.characters.indexOf(char);
      if (charIndexInSystem === -1) continue;

      // All octave variants (octave 0, -2, -1, +1, +2 at indices 0-4)
      // CRITICAL: Must match Rust octave_index() order in font_lookup_tables.rs
      for (let variantIdx = 0; variantIdx < OCTAVE_VARIANTS.length; variantIdx++) {
        const cp = (systemConfig.pua_base || 0) + (charIndexInSystem * (systemConfig.variants_per_character || 0)) + variantIdx;
        const variantLabel = OCTAVE_VARIANTS[variantIdx].label;
        const octaveShift = OCTAVE_VARIANTS[variantIdx].shift;
        tbody.appendChild(this.createTableRow(cp, String.fromCodePoint(cp), `${char} ${variantLabel}`, 'Octave Variant', `${systemName} octave ${octaveShift >= 0 ? '+' : ''}${octaveShift}`));
      }
    }

    // Add all accidentals (sharp, flat, double-sharp, double-flat)
    const accidentalTypes = [
      { name: 'sharp', pua: 0xE1F0, symbol: '♯' },
      { name: 'flat', pua: 0xE220, symbol: '♭' },
      { name: 'double-sharp', pua: 0xE250, symbol: '𝄪' },
      { name: 'double-flat', pua: 0xE280, symbol: '𝄫' }
    ];

    for (const accType of accidentalTypes) {
      for (let charIdx = 0; charIdx < allChars.length; charIdx++) {
        const char = allChars[charIdx];
        const cp = accType.pua + charIdx;
        const systemName = this.getCharacterSystem(char);
        tbody.appendChild(this.createTableRow(cp, String.fromCodePoint(cp), `${char}${accType.symbol} (${accType.name})`, 'Accidental', `${systemName} +${accType.name}`));
      }
    }

    // Add symbols (from WASM config - single source of truth)
    if (fontConfig?.symbols && fontConfig.symbols.length > 0) {
      for (const symbol of fontConfig.symbols) {
        const cp = symbol.codepoint;
        // Derive kind from name (barlineSingle → Barline, ornamentTrill → Ornament)
        const kind = symbol.name.startsWith('barline') ? 'Barline' :
                     symbol.name.startsWith('ornament') ? 'Ornament' : 'Symbol';
        tbody.appendChild(this.createTableRow(cp, String.fromCodePoint(cp), symbol.label, 'Symbol', kind));
      }
    }

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    section.appendChild(tableContainer);

    this.grid.appendChild(section);
  }

  createTableRow(cp: number, glyph: string, pitch: string, type: string, description: string): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-200 hover:bg-gray-50 transition-colors';

    const cpHex = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

    row.innerHTML = `
      <td class="px-4 py-2 font-mono text-blue-600 font-bold">${cpHex}</td>
      <td class="px-4 py-2 text-center" style="font-family: 'NotationFont', monospace; font-size: ${this.currentFontSize}pt;">${glyph}</td>
      <td class="px-4 py-2 text-gray-700">${pitch}</td>
      <td class="px-4 py-2"><span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">${type}</span></td>
      <td class="px-4 py-2 text-gray-600">${description}</td>
    `;

    return row;
  }

  getCharacterSystem(char: string): string {
    for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
      if (systemInfo.characters.includes(char)) {
        return systemInfo.display_name;
      }
    }
    return 'Unknown';
  }

  getSystemConfigForChar(char: string): PitchSystemInfo | null {
    for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
      if (systemInfo.characters.includes(char)) {
        // Find matching config from fontConfig
        const config = fontConfig?.systems?.find(s => s.system_name === systemKey);
        if (config) {
          return {
            ...systemInfo,
            pua_base: config.pua_base,
            variants_per_character: config.variants_per_character
          };
        }
        return systemInfo;
      }
    }
    return null;
  }
}

/// Initialize Font Sandbox with all custom glyphs
function initFontSandbox(): void {
  console.log('[FontTest] initFontSandbox called');
  const sandbox = document.getElementById('font-sandbox') as HTMLTextAreaElement | null;
  const sandboxSizeSelector = document.getElementById('font-sandbox-size') as HTMLSelectElement | null;

  if (!sandbox) {
    console.error('[FontTest] font-sandbox element not found');
    return;
  }
  if (!fontConfig) {
    console.error('[FontTest] fontConfig is null');
    return;
  }

  console.log('[FontTest] fontConfig.systems:', fontConfig.systems?.map(s => s.system_name));

  // Set initial font size
  sandbox.style.fontSize = '18pt';

  // Handle font size changes
  sandboxSizeSelector?.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    const newSize = parseInt(target.value);
    sandbox.style.fontSize = `${newSize}pt`;
  });

  // Start with symbols from WASM
  let content = '--- SYMBOLS (from WASM) ---\n';
  if (fontConfig?.symbols) {
    for (const symbol of fontConfig.symbols) {
      content += String.fromCodePoint(symbol.codepoint) + ' ';
    }
  }
  content += '\n\n';

  // Add provided Unicode music symbols
  content += '--- UNICODE MUSIC SYMBOLS ---\n';
  content += '𝄆 𝄙𝆏 𝅗𝅘𝅥𝅘𝅥𝅯𝅘𝅥𝅱 𝄞𝄟𝄢 𝄾𝄿𝄎 𝄴 𝄶𝅁 𝄭𝄰 𝇛𝇜 𝄊 𝄇 𝀸𝀹𝀺𝀻𝀼𝀽 𝈀𝈁𝈂𝈃𝈄𝈅𝄃 𝄞♯ 𝅘𝅥𝄾 𝄀 ♭𝅗𝅥♫ 𝆑𝆏 𝄂\n\n';

  // Add all pitch systems with octave variants
  content += '--- CUSTOM NOTATION FONT GLYPHS (Per-System PUA) ---\n\n';

  // For each pitch system
  for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
    // Find the system config from fontConfig.systems
    const systemConfig = fontConfig?.systems?.find(s => s.system_name === systemKey);
    if (!systemConfig) {
      logger.warn(LOG_CATEGORIES.WASM, `System ${systemKey} not found in fontConfig`);
      continue;
    }

    content += `${systemInfo.display_name}:\n`;
    const characters = systemInfo.characters;

    // For each character in the system
    // New layout: group-by-accidental-then-octave
    // For N characters: octaves 0, -2, -1, +1, +2 appear first (naturals)
    // Then flats (5N to 10N-1), then double-flats, sharps, double-sharps

    const numChars = characters.length;
    const octaveOrder = [
      { octave: 0, label: '0' },
      { octave: -2, label: '-2' },
      { octave: -1, label: '-1' },
      { octave: 1, label: '+1' },
      { octave: 2, label: '+2' }
    ];

    // CRITICAL: Must match build.rs calculate_system_codepoint() lines 441-449
    // Layout: Natural(0), Flat(5N), Half-flat(10N), Double-flat(15N), Double-sharp(20N), Sharp(25N)
    const accidentalTypes = [
      { name: 'natural', symbol: '', blockOffset: 0 },
      { name: 'flat', symbol: 'b', blockOffset: 5 },
      { name: 'half-flat', symbol: 'hf', blockOffset: 10 },
      { name: 'double-flat', symbol: 'bb', blockOffset: 15 },
      { name: 'double-sharp', symbol: '##', blockOffset: 20 },  // FIXED: was blockOffset 25
      { name: 'sharp', symbol: '#', blockOffset: 25 }  // FIXED: was blockOffset 20
    ];

    for (let charIndexInSystem = 0; charIndexInSystem < characters.length; charIndexInSystem++) {
      const char = characters[charIndexInSystem];

      // Label: character and all its variants
      content += char + ':';

      // Display each accidental type with all octave variants
      for (const acc of accidentalTypes) {
        // Add accidental type label
        if (acc.symbol) {
          content += ` [${acc.symbol}]`;
        } else {
          content += ' [nat]';
        }

        // Add octave variants for this accidental
        for (const octInfo of octaveOrder) {
          // Formula: base + (accidental_block × N) + (octave_group × N) + char_index
          const octaveGroupIdx = octaveOrder.indexOf(octInfo);
          const codepoint = systemConfig.pua_base
            + (acc.blockOffset * numChars)
            + (octaveGroupIdx * numChars)
            + charIndexInSystem;

          try {
            content += String.fromCodePoint(codepoint);
          } catch (e) {
            content += '?';
          }
        }
        content += ' ';
      }

      content += '\n';
    }

    content += '\n\n';
  }

  // Set the prefilled content
  console.log('[FontTest] Setting sandbox content, length:', content.length);
  sandbox.value = content;
}

// Initialize when DOM is ready
async function initFontTestUI(): Promise<void> {
  // Load font configuration from WASM
  const wasmReady = await initFontConfig();

  if (!wasmReady) {
    logger.error(LOG_CATEGORIES.WASM, 'FATAL: Font config initialization failed. Font Test UI cannot function without WASM.');
    return;
  }

  // Create UI instance
  (window as any).fontTestUI = new FontTestUI();

  // Show comprehensive view by default
  (window as any).fontTestUI.showComprehensiveView();

  // Initialize Font Sandbox
  initFontSandbox();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFontTestUI);
} else {
  initFontTestUI();
}
