/**
 * Cell Renderer for Music Notation Editor
 *
 * Converts DisplayList (from WASM layout engine) to DOM elements.
 * Pure DOM rendering with pre-calculated positions - no layout calculations.
 *
 * Handles:
 * - Cell rendering (pitched elements, symbols, barlines, text)
 * - Accidental composite glyphs (CSS overlay architecture)
 * - Lyrics positioning
 * - Ornament rendering
 * - Tala markers
 * - Document header (title, composer)
 */

import { BASE_FONT_SIZE } from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class CellRenderer {
  constructor(theDocument) {
    this.theDocument = theDocument;
  }

  /**
   * Update document reference (when document changes)
   * @param {Object} doc - New document
   */
  setDocument(doc) {
    this.theDocument = doc;
  }

  /**
   * Get the composite glyph character for rendering (same logic as measurement-service.js)
   * @param {string} baseChar - Base character (e.g., '5' from "5#")
   * @param {string} pitchCode - Serialized PitchCode string (e.g., "N5s", "N2b")
   * @returns {string} - Single character to render (composite glyph Unicode)
   */
  getCompositeGlyphChar(baseChar, pitchCode) {
    if (!pitchCode || typeof pitchCode !== 'string') {
      return baseChar;
    }

    // Detect accidental type from serialized PitchCode string
    // "N1s" → Sharp, "N2b" → Flat, "N1ss" → DoubleSharp, "N1bb" → DoubleFlat
    let accTypeNum = 0;
    if (pitchCode.endsWith('ss')) {
      accTypeNum = 3; // DoubleSharp
    } else if (pitchCode.endsWith('bb')) {
      accTypeNum = 4; // DoubleFlat
    } else if (pitchCode.endsWith('s')) {
      accTypeNum = 1; // Sharp
    } else if (pitchCode.endsWith('b')) {
      accTypeNum = 2; // Flat
    }

    if (accTypeNum === 0) {
      return baseChar; // Natural, no composite glyph
    }

    // Character order from atoms.yaml (ALL_CHARS constant)
    const charOrder = '1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT';
    const charIndex = charOrder.indexOf(baseChar);

    if (charIndex === -1) {
      return baseChar; // Unknown character
    }

    // Calculate codepoint (same formula as Rust)
    const baseCodepoints = {
      1: 0xE1F0,  // Sharp
      2: 0xE220,  // Flat
      3: 0xE250,  // Double sharp
      4: 0xE280   // Double flat
    };

    const codepoint = baseCodepoints[accTypeNum] + charIndex;
    return String.fromCodePoint(codepoint);
  }

  /**
   * Render document header from DisplayList
   *
   * @param {Object} header - Header data from DisplayList
   * @returns {HTMLElement|null} Header element or null if no header content
   */
  renderHeader(header) {
    const title = header.title;
    const composer = header.composer;

    // Skip if neither title nor composer
    if ((!title || title === 'Untitled Document') && !composer) {
      return null;
    }

    // Create container for title and composer
    const headerContainer = document.createElement('div');
    headerContainer.className = 'document-header';
    headerContainer.style.cssText = `
      position: relative;
      width: 100%;
      margin-top: 16px;
      margin-bottom: 32px;
      min-height: 24px;
    `;

    // Render title (centered)
    if (title && title !== 'Untitled Document') {
      const titleElement = document.createElement('div');
      titleElement.className = 'document-title';
      titleElement.setAttribute('data-testid', 'document-title');
      titleElement.textContent = title;
      titleElement.style.cssText = `
        text-align: center;
        font-size: ${BASE_FONT_SIZE * 0.8}px;
        font-weight: bold;
        color: #1f2937;
        width: 100%;
        margin-bottom: 8px;
      `;
      headerContainer.appendChild(titleElement);
    }

    // Render composer (flush right)
    if (composer) {
      const composerElement = document.createElement('div');
      composerElement.className = 'document-composer';
      composerElement.textContent = composer;
      composerElement.style.cssText = `
        text-align: right;
        font-size: ${BASE_FONT_SIZE * 0.6}px;
        font-style: italic;
        color: #6b7280;
        width: 100%;
        display: block;
        margin-top: 4px;
        padding-right: 20px;
      `;
      headerContainer.appendChild(composerElement);
    }

    return headerContainer;
  }

  /**
   * Render a single line from DisplayList
   * Pure DOM rendering with pre-calculated positions
   *
   * @param {Object} renderLine - RenderLine data from DisplayList
   * @param {number} currentLineIndex - Index of current line (for highlighting)
   * @param {boolean} gutterCollapsed - Whether gutter is collapsed
   * @returns {HTMLElement} The created line element
   */
  renderLine(renderLine, currentLineIndex = -1, gutterCollapsed = false) {
    const line = document.createElement('div');

    // Check if this is the current line (where the cursor is)
    const isCurrentLine = renderLine.line_index === currentLineIndex;

    // Read role from WASM DisplayList (source of truth)
    const lineRole = renderLine.staff_role || 'melody';

    line.className = isCurrentLine ? `notation-line current-line role-${lineRole}` : `notation-line role-${lineRole}`;
    line.dataset.line = renderLine.line_index;
    line.dataset.role = lineRole;
    line.style.cssText = `height:${renderLine.height}px; width:100%;`;

    // Store absolute Y position (computed in WASM)
    const lineStartY = renderLine.y;
    line.dataset.lineStartY = lineStartY;

    // Create gutter column (icon + label)
    const gutter = document.createElement('div');
    const hasLabel = !!renderLine.label;
    const gutterClass = gutterCollapsed
      ? 'line-gutter gutter-collapsed'
      : hasLabel ? 'line-gutter has-label' : 'line-gutter';
    gutter.className = gutterClass;

    // Gutter icon (role indicator)
    const gutterIcon = document.createElement('span');
    gutterIcon.className = 'gutter-icon';

    // Add tooltip based on role
    const roleTooltips = {
      'melody': 'Melody - Independent staff line',
      'group-header': 'Group Header - Groups multiple staves',
      'group-item': 'Group Member - Part of a staff group'
    };
    gutterIcon.title = roleTooltips[lineRole] || 'Staff line';

    gutter.appendChild(gutterIcon);

    // Label in gutter (if present)
    if (renderLine.label) {
      const labelElement = document.createElement('span');
      labelElement.className = 'line-label text-ui-disabled-text';
      labelElement.textContent = renderLine.label;
      gutter.appendChild(labelElement);
    }

    line.appendChild(gutter);

    // Create content wrapper for cells
    const lineContent = document.createElement('div');
    lineContent.className = 'line-content';
    lineContent.style.cssText = `position:relative; height:100%;`;

    // Get line index from renderLine
    const lineIndex = renderLine.line_index;

    // T028: Collect ornamental cells for floating rendering (render filtering)
    const ornamentalCells = [];

    // Render cells with new DOM structure
    renderLine.cells.forEach((cellData, idx) => {
      // Get cellIndex from dataset
      let cellIndex = idx;
      if (cellData.dataset) {
        if (cellData.dataset instanceof Map) {
          cellIndex = parseInt(cellData.dataset.get('cellIndex'));
        } else {
          cellIndex = parseInt(cellData.dataset.cellIndex);
        }
      }
      const cell = this.theDocument.lines[lineIndex].cells[cellIndex];

      // T028: Filter rhythm-transparent cells from main rendering flow
      if (cell && cell.ornament_indicator && cell.ornament_indicator.name !== 'none') {
        // Collect ornamental cell for floating rendering
        ornamentalCells.push({ cellData, cellIndex, cell });
        return; // Skip normal rendering for this cell
      }

      const cellContainer = this.renderCell(cellData, cell, lineStartY);
      lineContent.appendChild(cellContainer);
    });

    // Render all lyrics using positions from WASM DisplayList
    renderLine.lyrics.forEach(lyric => {
      const lyricSpan = this.renderLyric(lyric, lineStartY);
      lineContent.appendChild(lyricSpan);
    });

    // T029: Render ornamental cells (zero-width floating layout)
    ornamentalCells.forEach(({ cellData, cellIndex, cell }) => {
      const ornamentChar = this.renderOrnamentalCell(cellData, lineStartY);
      lineContent.appendChild(ornamentChar);
    });

    // Render ornaments (positioned to the RIGHT and UP from anchor notes)
    if (renderLine.ornaments && renderLine.ornaments.length > 0) {
      renderLine.ornaments.forEach(ornament => {
        const ornamentSpan = this.renderOrnament(ornament, lineStartY);
        lineContent.appendChild(ornamentSpan);
      });
    }

    // Render tala (positioned characters from DisplayList)
    renderLine.tala.forEach(talaChar => {
      const span = this.renderTala(talaChar, lineStartY);
      lineContent.appendChild(span);
    });

    // Append lineContent to line
    line.appendChild(lineContent);

    return line;
  }

  /**
   * Render a single cell
   * @param {Object} cellData - Cell data from DisplayList
   * @param {Object} cell - Cell from document model
   * @param {number} lineStartY - Absolute Y position of line start
   * @returns {HTMLElement} Cell container element
   */
  renderCell(cellData, cell, lineStartY) {
    // Create pitch span (the actual note character)
    const cellChar = document.createElement('span');
    // Filter out slur and beat-loop classes - these go on cell-container only
    const cellCharClasses = cellData.classes.filter(cls =>
      !cls.includes('slur-') && !cls.includes('beat-loop-')
    );
    cellChar.className = cellCharClasses.join(' ');

    // For pitched elements with accidentals, render the composite glyph
    // instead of the typed text (e.g., render U+E1F4 instead of "5#")
    let charToRender = cellData.char;
    if (cell && cell.kind && cell.kind.name === 'pitched_element' && cell.pitch_code) {
      const baseChar = cellData.char.charAt(0);
      const compositeGlyph = this.getCompositeGlyphChar(baseChar, cell.pitch_code);
      if (compositeGlyph !== baseChar) {
        // Cell has accidental, render composite glyph
        charToRender = compositeGlyph;
      }
    }

    cellChar.textContent = charToRender;

    // Apply barline glyph class from Rust
    if (cellData.barline_type) {
      cellChar.classList.add(cellData.barline_type);
    }

    cellChar.style.cssText = `
      display: inline-block;
      position: relative;
    `;

    // Apply fonts based on cell kind
    if (cell && cell.kind && cell.kind.name === 'text') {
      // Text cells use system fonts at reduced size
      cellChar.style.fontSize = `${BASE_FONT_SIZE * 0.6}px`;
      cellChar.style.fontFamily = "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
      cellChar.style.transform = 'translateY(40%)';
      cellChar.classList.add('text-cell');
    } else if (cell && cell.kind && (cell.kind.name === 'pitched_element' || cell.kind.name === 'unpitched_element')) {
      // Pitch and dash cells always use NotationFont (from Noto Music)
      cellChar.style.fontFamily = "'NotationFont'";
    } else if (cell && cell.kind && cell.kind.name === 'whitespace') {
      // Whitespace cells use NotationFont for consistent spacing with other glyphs
      cellChar.style.fontFamily = "'NotationFont'";
    }

    // Set data attributes on cell-char
    if (cellData.dataset) {
      if (cellData.dataset instanceof Map) {
        for (const [key, value] of cellData.dataset.entries()) {
          cellChar.dataset[key] = value;
        }
      } else {
        for (const [key, value] of Object.entries(cellData.dataset)) {
          cellChar.dataset[key] = value;
        }
      }
    }

    // Composite glyphs are rendered directly in char by Rust (src/html_layout/cell.rs)
    // No need for JavaScript overlay

    // Create cell-content wrapper (groups character + modifiers)
    const cellContent = document.createElement('span');
    cellContent.className = 'cell-content';
    cellContent.style.cssText = `
      position: relative;
      display: inline-block;
    `;
    cellContent.appendChild(cellChar);

    // Create cell-container wrapper - positioned at cell location
    const cellContainer = document.createElement('span');
    // Add only cell-container base class plus slur/beat-loop marker classes
    const containerClasses = ['cell-container', ...cellData.classes.filter(cls =>
      cls.includes('slur-') || cls.includes('beat-loop-')
    )];
    cellContainer.className = containerClasses.join(' ');

    // Convert absolute Y to relative Y within this line
    const relativeY = cellData.y - lineStartY;

    cellContainer.style.cssText = `
      position: absolute;
      left: ${cellData.x}px;
      top: ${relativeY}px;
      width: ${cellData.w}px;
      height: ${cellData.h}px;
    `;
    cellContainer.appendChild(cellContent);

    return cellContainer;
  }

  /**
   * Render a lyric element
   * @param {Object} lyric - Lyric data from DisplayList
   * @param {number} lineStartY - Absolute Y position of line start
   * @returns {HTMLElement} Lyric span element
   */
  renderLyric(lyric, lineStartY) {
    const lyricSpan = document.createElement('span');
    lyricSpan.className = 'cell-text lyric';
    lyricSpan.textContent = lyric.text;
    const lyricFontSize = BASE_FONT_SIZE * 0.5; // 1/2 of base font size
    const lyricRelativeY = lyric.y - lineStartY;
    lyricSpan.style.cssText = `
      position: absolute;
      left: ${lyric.x}px;
      top: ${lyricRelativeY}px;
      font-size: ${lyricFontSize}px;
      font-family: 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
      font-style: italic;
      color: #6b7280;
      pointer-events: none;
      white-space: nowrap;
    `;
    return lyricSpan;
  }

  /**
   * Render an ornamental cell (rhythm-transparent, zero-width floating)
   * @param {Object} cellData - Cell data from DisplayList
   * @param {number} lineStartY - Absolute Y position of line start
   * @returns {HTMLElement} Ornament character element
   */
  renderOrnamentalCell(cellData, lineStartY) {
    const ornamentChar = document.createElement('span');

    // Apply CSS classes including ornament-cell
    const ornamentClasses = cellData.classes.filter(cls =>
      !cls.includes('slur-') && !cls.includes('beat-loop-')
    );
    ornamentChar.className = ornamentClasses.join(' ');
    ornamentChar.textContent = cellData.char;

    // Set data attributes for testing
    if (cellData.dataset) {
      if (cellData.dataset instanceof Map) {
        for (const [key, value] of cellData.dataset.entries()) {
          ornamentChar.dataset[key] = value;
        }
      } else {
        for (const [key, value] of Object.entries(cellData.dataset)) {
          ornamentChar.dataset[key] = value;
        }
      }
    }

    // Convert absolute Y to relative Y within this line
    const ornamentRelativeY = cellData.y - lineStartY;

    // Zero-width floating layout with absolute positioning
    ornamentChar.style.cssText = `
      position: absolute;
      left: ${cellData.x}px;
      top: ${ornamentRelativeY}px;
      width: 0;
      height: ${cellData.h}px;
      pointer-events: none;
      z-index: 5;
    `;

    return ornamentChar;
  }

  /**
   * Render an ornament marker (positioned RIGHT and UP from anchor)
   * @param {Object} ornament - Ornament data from DisplayList
   * @param {number} lineStartY - Absolute Y position of line start
   * @returns {HTMLElement} Ornament span element
   */
  renderOrnament(ornament, lineStartY) {
    const ornamentSpan = document.createElement('span');
    ornamentSpan.className = 'char-cell ' + (ornament.classes || []).join(' ');
    ornamentSpan.textContent = ornament.text;
    ornamentSpan.dataset.testid = 'ornament-cell'; // For E2E tests
    const ornamentRelativeY = ornament.y - lineStartY;
    ornamentSpan.style.cssText = `
      position: absolute;
      left: ${ornament.x}px;
      top: ${ornamentRelativeY}px;
      font-size: ${BASE_FONT_SIZE * 0.6}px;
      font-family: 'NotationFont', monospace;
      color: #1e40af;
      pointer-events: none;
      white-space: nowrap;
    `;
    return ornamentSpan;
  }

  /**
   * Render a tala marker (positioned character)
   * @param {Object} talaChar - Tala character data from DisplayList
   * @param {number} lineStartY - Absolute Y position of line start
   * @returns {HTMLElement} Tala span element
   */
  renderTala(talaChar, lineStartY) {
    const span = document.createElement('span');
    span.className = 'tala-char text-xs';
    span.textContent = talaChar.text;
    const talaRelativeY = talaChar.y - lineStartY;
    span.style.cssText = `
      position: absolute;
      left: ${talaChar.x}px;
      top: ${talaRelativeY}px;
      transform: translateX(-50%);
      color: #4b5563;
      font-weight: 600;
      pointer-events: none;
    `;
    return span;
  }
}

export default CellRenderer;
