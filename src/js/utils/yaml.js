/**
 * YAML utility functions
 *
 * Extracted from editorHelpers.js to follow single responsibility principle.
 * Provides lightweight YAML serialization for inspector panels.
 */

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

    // Special ordering for root document: alphabetical with lines first, then verbose fields last
    if (indent === 0) {
      const verboseFields = ['lines', 'state'];
      const mainKeys = keys.filter(k => !verboseFields.includes(k)).sort();
      const endKeys = verboseFields.filter(k => keys.includes(k));
      keys = [...mainKeys, ...endKeys];
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
  toYAML
};
