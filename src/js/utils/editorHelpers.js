/**
 * editorHelpers - Common utility functions used throughout the editor
 *
 * These helpers reduce code duplication and provide reusable patterns
 */

/**
 * Ensure WASM document is in sync before operations
 * @param {Object} wasmModule - WASM bridge instance
 * @param {Object} document - Document to sync
 * @returns {boolean} - Success status
 */
export function syncDocumentWithWASM(wasmModule, document) {
  if (!document || !wasmModule) {
    console.warn('Cannot sync: document or WASM module is null');
    return false;
  }

  try {
    wasmModule.loadDocument(document);
    return true;
  } catch (e) {
    console.warn('Failed to sync document with WASM:', e);
    return false;
  }
}

/**
 * Check if document is ready for operations
 * @param {Object} document - Document to check
 * @returns {boolean} - True if document is valid and ready
 */
export function isDocumentReady(document) {
  return !!(document && document.lines && document.lines.length > 0);
}

/**
 * Normalize selection range to handle both object and numeric formats
 * @param {Object} selection - Selection object
 * @returns {Object} - Normalized {start, end} with numeric values
 */
export function normalizeSelectionRange(selection) {
  if (!selection) return null;

  const startCol = typeof selection.start === 'object' ? selection.start.col : selection.start;
  const endCol = typeof selection.end === 'object' ? selection.end.col : selection.end;

  return {
    start: Math.min(startCol, endCol),
    end: Math.max(startCol, endCol)
  };
}

/**
 * Safely get current line from document
 * @param {Object} document - Document object
 * @param {number} lineIndex - Optional line index (defaults to cursor line)
 * @returns {Object|null} - Line object or null if not found
 */
export function getCurrentLine(document, lineIndex = null) {
  if (!isDocumentReady(document)) {
    return null;
  }

  const index = lineIndex !== null ? lineIndex : document.state?.cursor?.line ?? 0;
  return document.lines[index] || null;
}

/**
 * Format HTML string with proper indentation for display
 * @param {string} html - HTML string to format
 * @param {number} indentSize - Number of spaces per indent level
 * @returns {string} - Formatted HTML
 */
export function formatHTML(html, indentSize = 2) {
  let formatted = html;
  let indent = 0;

  // Add newlines between tags
  formatted = formatted.replace(/></g, '>\n<');
  const lines = formatted.split('\n');

  const formattedLines = lines.map(line => {
    const trimmed = line.trim();

    // Decrease indent for closing tags
    if (trimmed.match(/^<\//)) {
      indent = Math.max(0, indent - indentSize);
    }

    const indented = ' '.repeat(indent) + trimmed;

    // Increase indent for opening tags (but not self-closing or inline)
    if (trimmed.match(/^<[^/!]/) && !trimmed.match(/\/>$/) && !trimmed.match(/<\/.*>$/)) {
      indent += indentSize;
    }

    return indented;
  });

  return formattedLines.join('\n');
}

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
export function capitalizeFirst(str) {
  if (!str || str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert JavaScript object to concise YAML format
 * @param {any} obj - Object to convert
 * @param {number} indent - Current indentation level
 * @returns {string} - YAML representation
 */
export function toYAML(obj, indent = 0) {
  const spaces = '  '.repeat(indent);

  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';

  const type = typeof obj;

  // Handle primitives
  if (type === 'string') return `"${obj}"`;
  if (type === 'number' || type === 'boolean') return String(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';

    // Inline for simple arrays
    if (obj.every(item => typeof item !== 'object' || item === null)) {
      const items = obj.map(item => toYAML(item, 0)).join(', ');
      return `[${items}]`;
    }

    // Multi-line for complex arrays
    return `\n${obj.map(item => {
      const value = toYAML(item, indent + 1);
      if (value.startsWith('\n')) {
        return `${spaces}  -${value}`;
      }
      return `${spaces}  - ${value}`;
    }).join('\n')}`;
  }

  // Handle objects
  if (type === 'object') {
    let keys = Object.keys(obj);
    if (keys.length === 0) return '{}';

    // Special ordering for root document: alphabetical with 'lines' at the end
    if (indent === 0 && keys.includes('lines')) {
      const linesKey = 'lines';
      const otherKeys = keys.filter(k => k !== 'lines').sort();
      keys = [...otherKeys, linesKey];
    }

    return `\n${keys.map(key => {
      const value = toYAML(obj[key], indent + 1);
      if (value.startsWith('\n')) {
        return `${spaces}  ${key}:${value}`;
      }
      return `${spaces}  ${key}: ${value}`;
    }).join('\n')}`;
  }

  return String(obj);
}

export default {
  syncDocumentWithWASM,
  isDocumentReady,
  normalizeSelectionRange,
  getCurrentLine,
  formatHTML,
  capitalizeFirst,
  toYAML
};
