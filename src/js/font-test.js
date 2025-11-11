/**
 * Font Test UI - Display all custom glyphs in NotationFont (from Noto Music)
 *
 * IMPORTANT: Font constants are loaded from Rust at runtime via getFontConfig()
 * This ensures JavaScript always uses the correct code points from build.rs
 * regardless of changes to atoms.yaml or font generation.
 */

// Font configuration loaded from WASM and NotationFont-map.json
let fontConfig = null;
let fontMapData = null;

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
const OCTAVE_VARIANTS = [
  { shift: 1, label: "1 dot above (octave +1)" },
  { shift: 2, label: "2 dots above (octave +2)" },
  { shift: -1, label: "1 dot below (octave -1)" },
  { shift: -2, label: "2 dots below (octave -2)" }
];

// Initialize font config from WASM and load NotationFont-map.json
async function initFontConfig() {
  try {
    // Load NotationFont-map.json first (single source of truth)
    try {
      const mapResponse = await fetch('static/fonts/NotationFont-map.json');
      if (mapResponse.ok) {
        fontMapData = await mapResponse.json();
        console.log('✓ Font map loaded from NotationFont-map.json');
      }
    } catch (mapError) {
      console.warn('⚠ Could not load NotationFont-map.json:', mapError);
    }

    // Try to get font config from editor instance first (preferred)
    let config = window.editor?.wasmModule?.getFontConfig?.();

    // Fallback to global window.wasmModule if available
    if (!config) {
      config = window.wasmModule?.getFontConfig?.();
    }

    if (config) {
      fontConfig = config;
      console.log('✓ Font config loaded from WASM:', fontConfig);
      return true;
    } else {
      console.warn('⚠ getFontConfig not available, using fallback constants');
      // Fallback to hardcoded if WASM not ready
      fontConfig = {
        all_chars: "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT",
        pua_start: 0xE600,
        chars_per_variant: 4,
        accidental_pua_start: 0xE1F0,
        symbols_pua_start: 0xE220,
        total_characters: 47
      };
      return false;
    }
  } catch (e) {
    console.error('Error loading font config:', e);
    return false;
  }
}

export class FontTestUI {
  constructor() {
    this.grid = document.getElementById('font-test-grid');
    this.showAllBtn = document.getElementById('font-test-show-all');
    this.tableBtn = document.getElementById('font-test-show-table');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.showAllBtn?.addEventListener('click', () => this.showComprehensiveView());
    this.tableBtn?.addEventListener('click', () => this.showUnicodeTable());
  }

  showComprehensiveView() {
    this.grid.innerHTML = '';

    // 1. Display symbols first (from NotationFont-map.json - single source of truth)
    if (fontMapData?.symbols && fontMapData.symbols.length > 0) {
      this.addSymbolsFromMap();
    } else {
      console.warn('No symbols found in font map data');
    }

    // 2. Display each pitch system with all variants
    for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
      this.addPitchSystemSection(systemKey, systemInfo);
    }
  }

  addSymbolsFromMap() {
    // Group symbols by kind
    const symbolsByKind = {};
    for (const symbol of fontMapData.symbols) {
      if (!symbolsByKind[symbol.kind]) {
        symbolsByKind[symbol.kind] = [];
      }
      symbolsByKind[symbol.kind].push(symbol);
    }

    // Display symbols grouped by kind
    const kindOrder = ['bracket', 'accidental', 'barline', 'ornament'];
    const kindLabels = {
      'bracket': 'Brackets (Staff Grouping)',
      'accidental': 'Accidentals',
      'barline': 'Barlines & Repeat Markers',
      'ornament': 'Ornaments'
    };

    for (const kind of kindOrder) {
      if (symbolsByKind[kind]) {
        const symbols = symbolsByKind[kind].map(s => ({
          cp: parseInt(s.codepoint, 16),
          label: s.label
        }));
        this.addSymbolSection(kindLabels[kind] || kind, symbols);
      }
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

    // Create grid for this pitch system
    const pitchGrid = document.createElement('div');
    pitchGrid.className = 'space-y-4';
    section.appendChild(pitchGrid);

    // For each character, show all octave variants
    for (const char of characters) {
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

      // Natural version (no octave shift)
      const charIndex = fontConfig.all_chars.indexOf(char);
      if (charIndex !== -1) {
        const naturalItem = this.createGlyphItem(char, `${char} (natural)`, null);
        variantGrid.appendChild(naturalItem);

        // All octave variants
        for (let i = 0; i < OCTAVE_VARIANTS.length; i++) {
          const variant = OCTAVE_VARIANTS[i];
          const cp = fontConfig.pua_start + (charIndex * fontConfig.chars_per_variant) + i;
          const label = `${char} ${variant.label}`;
          const item = this.createGlyphItem(cp, label, `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
          variantGrid.appendChild(item);
        }
      }

      charContainer.appendChild(variantGrid);

      // Sharp accidental for this character
      if (charIndex !== -1 && charIndex < fontConfig.all_chars.length) {
        const sharpLabel = document.createElement('h4');
        sharpLabel.className = 'text-xs font-semibold text-gray-600 mt-3 mb-2';
        sharpLabel.textContent = 'With Sharp Accidental';
        charContainer.appendChild(sharpLabel);

        const sharpGrid = document.createElement('div');
        sharpGrid.className = 'grid grid-cols-4 gap-2';

        const sharpCp = fontConfig.accidental_pua_start + charIndex;
        const sharpItem = this.createGlyphItem(sharpCp, `${char}#`, `U+${sharpCp.toString(16).toUpperCase().padStart(4, '0')}`);
        sharpGrid.appendChild(sharpItem);

        charContainer.appendChild(sharpGrid);
      }

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
    glyphDiv.className = 'font-test-glyph-display font-bold mb-2 text-center text-[20pt]';
    glyphDiv.style.fontFamily = "'NotationFont', monospace";
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

      // Natural (no octave shift)
      const cpNatural = char.charCodeAt(0);
      tbody.appendChild(this.createTableRow(cpNatural, char, `${char} (natural)`, 'Base Pitch', systemName));

      // Octave variants
      for (let variantIdx = 0; variantIdx < 4; variantIdx++) {
        const cp = fontConfig.pua_start + (charIdx * fontConfig.chars_per_variant) + variantIdx;
        const variantLabel = OCTAVE_VARIANTS[variantIdx].label;
        tbody.appendChild(this.createTableRow(cp, String.fromCodePoint(cp), `${char} with ${variantLabel}`, 'Octave Variant', `${systemName} +octave`));
      }
    }

    // Add sharp accidentals
    for (let charIdx = 0; charIdx < allChars.length; charIdx++) {
      const char = allChars[charIdx];
      const cp = fontConfig.accidental_pua_start + charIdx;
      const systemName = this.getCharacterSystem(char);
      tbody.appendChild(this.createTableRow(cp, String.fromCodePoint(cp), `${char}# (sharp)`, 'Accidental', `${systemName} +sharp`));
    }

    // Add symbols (from font map data - single source of truth)
    if (fontMapData?.symbols && fontMapData.symbols.length > 0) {
      for (const symbol of fontMapData.symbols) {
        const cp = parseInt(symbol.codepoint, 16);
        const kind = symbol.kind.charAt(0).toUpperCase() + symbol.kind.slice(1);
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
      <td class="px-4 py-2 text-center text-xl" style="font-family: 'NotationFont', monospace">${glyph}</td>
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

  getSymbolType(cp) {
    if (SYMBOLS.accidentals.find(s => s.cp === cp)) return 'Accidental';
    if (SYMBOLS.barlines.find(s => s.cp === cp)) return 'Barline';
    if (SYMBOLS.ornaments.find(s => s.cp === cp)) return 'Ornament';
    return 'Symbol';
  }
}

/// Initialize Font Sandbox with all custom glyphs
function initFontSandbox() {
  const sandbox = document.getElementById('font-sandbox');
  if (!sandbox || !fontConfig) return;

  // Start with brackets (staff grouping)
  let content = '--- BRACKETS (from Bravura) ---\n';
  if (fontMapData?.symbols) {
    const brackets = fontMapData.symbols.filter(s => s.kind === 'bracket');
    for (const bracket of brackets) {
      const cp = parseInt(bracket.codepoint, 16);
      content += String.fromCodePoint(cp) + ' ';
    }
  }
  content += '\n\n';

  // Add provided Unicode music symbols
  content += '--- UNICODE MUSIC SYMBOLS ---\n';
  content += '𝄆 𝄙𝆏 𝅗𝅘𝅥𝅘𝅥𝅯𝅘𝅥𝅱 𝄞𝄟𝄢 𝄾𝄿𝄎 𝄴 𝄶𝅁 𝄭𝄰 𝇛𝇜 𝄊 𝄇 𝀸𝀹𝀺𝀻𝀼𝀽 𝈀𝈁𝈂𝈃𝈄𝈅𝄃 𝄞♯ 𝅘𝅥𝄾 𝄀 ♭𝅗𝅥♫ 𝆑𝆏 𝄂\n\n';

  // Add all pitch systems with octave variants
  content += '--- CUSTOM NOTATION FONT GLYPHS ---\n\n';

  // For each pitch system
  for (const [systemKey, systemInfo] of Object.entries(PITCH_SYSTEMS)) {
    content += `${systemInfo.display_name}:\n`;
    const characters = systemInfo.characters;

    // For each character in the system
    for (const char of characters) {
      const charIndex = fontConfig.all_chars.indexOf(char);
      if (charIndex === -1) continue;

      // Natural
      content += char;

      // All octave variants
      for (let variantIdx = 0; variantIdx < 4; variantIdx++) {
        const cp = fontConfig.pua_start + (charIndex * fontConfig.chars_per_variant) + variantIdx;
        content += String.fromCodePoint(cp);
      }

      // Sharp accidental
      const sharpCp = fontConfig.accidental_pua_start + charIndex;
      content += String.fromCodePoint(sharpCp);

      content += ' ';
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
    console.warn('Using fallback font configuration');
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
