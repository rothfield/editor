/**
 * editorHelpers - Common utility functions used throughout the editor
 *
 * These helpers reduce code duplication and provide reusable patterns
 */

import type { WASMModule } from '../../types/wasm-module.js';
import type { Document, DocumentLine } from '../../types/wasm.js';

interface Selection {
  start: { col: number } | number;
  end: { col: number } | number;
}

interface DocumentWithState extends Document {
  state?: {
    cursor?: {
      line?: number;
    };
  };
}

/**
 * Ensure WASM document is in sync before operations
 * @param wasmModule - WASM bridge instance
 * @param document - Document to sync
 * @returns Success status
 */
export function syncDocumentWithWASM(wasmModule: WASMModule | null, document: Document | null): boolean {
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
 * @param document - Document to check
 * @returns True if document is valid and ready
 */
export function isDocumentReady(document: Document | null): document is Document {
  return !!(document && document.lines && document.lines.length > 0);
}

/**
 * Normalize selection range to handle both object and numeric formats
 * @param selection - Selection object
 * @returns Normalized {start, end} with numeric values
 */
export function normalizeSelectionRange(selection: Selection | null): { start: number; end: number } | null {
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
 * @param document - Document object
 * @param lineIndex - Optional line index (defaults to cursor line)
 * @returns Line object or null if not found
 */
export function getCurrentLine(document: DocumentWithState | null, lineIndex: number | null = null): DocumentLine | null {
  if (!isDocumentReady(document)) {
    return null;
  }

  const index = lineIndex !== null ? lineIndex : document.state?.cursor?.line ?? 0;
  return document.lines[index] || null;
}

/**
 * Format HTML string with proper indentation for display
 * @param html - HTML string to format
 * @param indentSize - Number of spaces per indent level
 * @returns Formatted HTML
 */
export function formatHTML(html: string, indentSize: number = 2): string {
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
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalizeFirst(str: string): string {
  if (!str || str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert JavaScript object to concise YAML format
 * @param obj - Object to convert
 * @param indent - Current indentation level
 * @returns YAML representation
 */
export function toYAML(obj: unknown, indent: number = 0): string {
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
    const record = obj as Record<string, unknown>;
    let keys = Object.keys(record);
    if (keys.length === 0) return '{}';

    // Special ordering for root document: alphabetical with 'lines' at the end
    if (indent === 0 && keys.includes('lines')) {
      const linesKey = 'lines';
      const otherKeys = keys.filter(k => k !== 'lines').sort();
      keys = [...otherKeys, linesKey];
    }

    return `\n${keys.map(key => {
      const value = toYAML(record[key], indent + 1);
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
