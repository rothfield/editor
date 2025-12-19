/**
 * Font Test UI - Display all custom glyphs in NotationFont (from Noto Music)
 *
 * IMPORTANT: Font constants are loaded from Rust at runtime via getFontConfig()
 * This ensures JavaScript always uses the correct code points from build.rs
 * regardless of changes to atoms.yaml or font generation.
 */

import logger, { LOG_CATEGORIES } from './logger.js';

// Font configuration loaded from WASM only (single source of truth)
let fontConfig = null;

// Notation system definitions (from atoms.yaml)
const PITCH_SYSTEMS = {
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
const OCTAVE_VARIANTS = [
  { shift: 0, label: "(natural - octave 0)" },     // Index 0
  { shift: -2, label: "2 dots below (octave -2)" }, // Index 1
  { shift: -1, label: "1 dot below (octave -1)" },  // Index 2
  { shift: 1, label: "1 dot above (octave +1)" },   // Index 3
  { shift: 2, label: "2 dots above (octave +2)" }   // Index 4
];

// Initialize font config from WASM (single source of truth)
async function initFontConfig() {
  try {
    // Wait for editor to be fully initialized (max 10 seconds)
    let attempts = 0;
    while (!window.editor?.wasmModule?.getFontConfig && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    // Get font config from WASM (includes systems + symbols)
    const config = window.editor?.wasmModule?.getFontConfig?.();

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
  constructor() {
    this.grid = document.getElementById('font-test-grid');
    this.showAllBtn = document.getElementById('font-test-show-all');
    this.tableBtn = document.getElementById('font-test-show-table');
    this.fontSizeSelector = document.getElementById('font-test-size');
    this.currentFontSize = 20; // Default 20pt

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.showAllBtn?.addEventListener('click', () => this.showComprehensiveView());
    this.tableBtn?.addEventListener('click', () => this.showUnicodeTable());
    this.fontSizeSelector?.addEventListener('change', (e) => this.handleFontSizeChange(e));
  }

  handleFontSizeChange(e) {
    this.currentFontSize = parseInt(e.target.value);
    // Re-render the current view with new font size
    const currentView = this.grid.querySelector('.mb-6') ? 'comprehensive' : 'table';
    if (currentView === 'comprehensive') {
      this.showComprehensiveView();
    } else {
      this.showUnicodeTable();
    }
  }

  showComprehensiveView() {
    this.grid.innerHTML = '';

    // 1. Display symbols first (from WASM - single source of truth)
    if (fontConfig?.symbols && fontConfig.symbols.length > 0) {
      this.addSymbolsFromWasm();
    } else {
      logger.warn(LOG_CATEGORIES.WASM, 'No symbols found in WASM font config');
    }

    // 2. Display each pitch system with all variants (including accidentals)
    for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
      this.addPitchSystemSection(systemKey, systemInfo);
    }
  }

  addSymbolsFromWasm() {
    // Group symbols by type (barline vs ornament) based on name prefix
    const barlines = [];
    const ornaments = [];

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

  addPitchSystemSection(systemKey, systemInfo) {
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
    const systemConfig = fontConfig.systems?.find(s => s.system_name === systemKey);
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

  addSymbolSection(title, symbols) {
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

  createGlyphItem(codepoint, label, cpDisplay) {
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
    let glyphChar;
    if (typeof codepoint === 'number') {
      glyphChar = String.fromCodePoint(codepoint);
    } else if (typeof codepoint === 'string' && codepoint.length === 1) {
      glyphChar = codepoint;
    } else if (typeof codepoint === 'string') {
      glyphChar = codepoint;
    } else {
      glyphChar = String.fromCodePoint(codepoint);
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
      let cp;
      if (typeof codepoint === 'number') {
        cp = codepoint;
      } else if (typeof codepoint === 'string' && codepoint.length === 1) {
        cp = codepoint.charCodeAt(0);
      } else {
        cp = codepoint.charCodeAt(0);
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

  showUnicodeTable() {
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
    const allChars = fontConfig.all_chars;
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
        const cp = systemConfig.pua_base + (charIndexInSystem * systemConfig.variants_per_character) + variantIdx;
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

  createTableRow(cp, glyph, pitch, type, description) {
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

  getCharacterSystem(char) {
    for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
      if (systemInfo.characters.includes(char)) {
        return systemInfo.display_name;
      }
    }
    return 'Unknown';
  }

  getSystemConfigForChar(char) {
    for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
      if (systemInfo.characters.includes(char)) {
        return systemInfo;
      }
    }
    return null;
  }
}

/// Initialize Font Sandbox with all custom glyphs
function initFontSandbox() {
  const sandbox = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('font-sandbox'));
  const sandboxSizeSelector = document.getElementById('font-sandbox-size');
  if (!sandbox || !fontConfig) return;

  // Set initial font size
  sandbox.style.fontSize = '18pt';

  // Handle font size changes
  sandboxSizeSelector?.addEventListener('change', (e) => {
    const target = /** @type {HTMLSelectElement} */ (e.target);
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
    const systemConfig = fontConfig.systems?.find(s => s.system_name === systemKey);
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
  sandbox.value = content;
}

// Initialize when DOM is ready
async function initFontTestUI() {
  // Load font configuration from WASM
  const wasmReady = await initFontConfig();

  if (!wasmReady) {
    logger.error(LOG_CATEGORIES.WASM, 'FATAL: Font config initialization failed. Font Test UI cannot function without WASM.');
    return;
  }

  // Create UI instance
  window.fontTestUI = new FontTestUI();

  // Show comprehensive view by default
  window.fontTestUI.showComprehensiveView();

  // Initialize Font Sandbox
  initFontSandbox();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFontTestUI);
} else {
  initFontTestUI();
}
