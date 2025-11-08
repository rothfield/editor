/**
 * Font Test UI - Display all custom glyphs in NotationFont (from Noto Music)
 */

// Base characters in canonical order (from font_utils.rs)
const ALL_CHARS = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";

const OCTAVE_START = 0xE000;
const SHARP_START = 0xE1F0;
const CHARS_PER_VARIANT = 4;

export class FontTestUI {
  constructor() {
    this.grid = document.getElementById('font-test-grid');
    this.showAllBtn = document.getElementById('font-test-show-all');
    this.sharpsBtn = document.getElementById('font-test-show-sharps');
    this.octavesBtn = document.getElementById('font-test-show-octaves');
    this.symbolsBtn = document.getElementById('font-test-show-symbols');

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.showAllBtn?.addEventListener('click', () => this.showAll());
    this.sharpsBtn?.addEventListener('click', () => this.showSharps());
    this.octavesBtn?.addEventListener('click', () => this.showOctaves());
    this.symbolsBtn?.addEventListener('click', () => this.showSymbols());
  }

  showAll() {
    this.grid.innerHTML = '';

    // Show octave variants
    this.addSection('Octave Variants (U+E000-U+E0BB)', () => {
      for (let i = 0; i < ALL_CHARS.length * 4; i++) {
        const cp = OCTAVE_START + i;
        const charIdx = Math.floor(i / 4);
        const variantIdx = i % 4;
        const baseChar = ALL_CHARS[charIdx];
        const octaveStr = ['+1 dot', '+2 dots', '-1 dot', '-2 dots'][variantIdx];
        this.addGlyph(cp, `${baseChar}${octaveStr}`);
      }
    });

    // Show sharp accidentals
    this.addSection('Sharp Accidentals (U+E1F0-U+E21E)', () => {
      for (let i = 0; i < ALL_CHARS.length; i++) {
        const cp = SHARP_START + i;
        const baseChar = ALL_CHARS[i];
        this.addGlyph(cp, `${baseChar}#`);
      }
    });

    // Show special characters (barlines, etc.)
    this.addSection('Special Characters', () => {
      this.addGlyph("@".charCodeAt(0), "@ (Right Repeat)");
      this.addGlyph("|".charCodeAt(0), "| (Barline)");
    });
  }

  showSharps() {
    this.grid.innerHTML = '';
    this.addSection('Sharp Accidentals (U+E1F0-U+E21E)', () => {
      for (let i = 0; i < ALL_CHARS.length; i++) {
        const cp = SHARP_START + i;
        const baseChar = ALL_CHARS[i];
        this.addGlyph(cp, `${baseChar}#`);
      }
    });
  }

  showOctaves() {
    this.grid.innerHTML = '';
    this.addSection('Octave Variants (U+E000-U+E0BB)', () => {
      for (let i = 0; i < ALL_CHARS.length * 4; i++) {
        const cp = OCTAVE_START + i;
        const charIdx = Math.floor(i / 4);
        const variantIdx = i % 4;
        const baseChar = ALL_CHARS[charIdx];
        const octaveStr = ['+1', '+2', '-1', '-2'][variantIdx];
        this.addGlyph(cp, `${baseChar}${octaveStr}`);
      }
    });
  }

  showSymbols() {
    this.grid.innerHTML = '';

    // Symbols are allocated starting at U+E220 (after sharp accidentals at U+E1FF)
    const SYMBOLS_START = 0xE220;

    // Show accidentals
    this.addSection('Accidentals (U+E260-U+E264)', () => {
      const accidentals = [
        { offset: 0, label: 'Flat (♭)' },
        { offset: 1, label: 'Natural (♮)' },
        { offset: 2, label: 'Sharp (#)' },
        { offset: 3, label: 'Double Sharp (𝄪)' },
        { offset: 4, label: 'Double Flat (𝄫)' },
      ];
      for (const acc of accidentals) {
        this.addGlyph(SYMBOLS_START + acc.offset, acc.label);
      }
    });

    // Show barlines
    this.addSection('Barlines (U+E030-E042)', () => {
      const barlines = [
        { offset: 5, label: 'Single Barline' },
        { offset: 6, label: 'Double Barline' },
        { offset: 7, label: 'Repeat Left' },
        { offset: 8, label: 'Repeat Right' },
        { offset: 9, label: 'Repeat Both' },
      ];
      for (const bar of barlines) {
        this.addGlyph(SYMBOLS_START + bar.offset, bar.label);
      }
    });

    // Show ornaments
    this.addSection('Ornaments (U+E566-E56E)', () => {
      const ornaments = [
        { offset: 10, label: 'Trill' },
        { offset: 11, label: 'Turn' },
        { offset: 12, label: 'Mordent' },
        { offset: 13, label: 'Inverted Mordent' },
      ];
      for (const orn of ornaments) {
        this.addGlyph(SYMBOLS_START + orn.offset, orn.label);
      }
    });
  }

  addSection(title, contentFn) {
    const section = document.createElement('div');
    section.className = 'mb-4';

    const heading = document.createElement('h4');
    heading.className = 'text-xs font-bold text-gray-700 mb-2';
    heading.textContent = title;
    section.appendChild(heading);

    const glyphContainer = document.createElement('div');
    glyphContainer.className = 'grid grid-cols-4 gap-2';
    glyphContainer.id = 'glyph-container-temp'; // Temporary
    section.appendChild(glyphContainer);

    this.grid.appendChild(section);

    // Temporarily set grid so addGlyph works
    const oldGrid = this.grid;
    this.grid = glyphContainer;
    contentFn();
    this.grid = oldGrid;
  }

  addGlyph(codepoint, label) {
    const item = document.createElement('div');
    item.className = 'font-test-glyph-item border border-gray-300 rounded p-2 text-center bg-gray-50 hover:bg-gray-100 transition-colors';

    // Glyph display
    const glyphDiv = document.createElement('div');
    glyphDiv.className = 'font-test-glyph-display font-bold mb-1 text-center text-[18pt]';
    glyphDiv.style.fontFamily = "'NotationFont', monospace";
    glyphDiv.style.minHeight = '40px';
    glyphDiv.style.display = 'flex';
    glyphDiv.style.alignItems = 'center';
    glyphDiv.style.justifyContent = 'center';
    glyphDiv.textContent = String.fromCodePoint(codepoint);

    // Label
    const labelDiv = document.createElement('div');
    labelDiv.className = 'font-test-glyph-label text-xs text-gray-600 mb-1';
    labelDiv.textContent = label;

    // Codepoint
    const cpDiv = document.createElement('div');
    cpDiv.className = 'font-test-glyph-codepoint text-xs font-mono text-blue-600';
    cpDiv.textContent = `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;

    item.appendChild(glyphDiv);
    item.appendChild(labelDiv);
    item.appendChild(cpDiv);

    this.grid.appendChild(item);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.fontTestUI = new FontTestUI();
    // Show all glyphs by default
    window.fontTestUI.showAll();
  });
} else {
  window.fontTestUI = new FontTestUI();
  window.fontTestUI.showAll();
}
