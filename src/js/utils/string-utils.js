/**
 * String utility functions
 *
 * Extracted from editor.js to follow single responsibility principle.
 * These are general-purpose string utilities with no music domain knowledge.
 */

/**
 * Capitalize the first character of a string
 * @param {string} str - String to capitalize
 * @returns {string} String with first character capitalized
 */
export function capitalizeFirst(str) {
  if (!str || str.length === 0) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Truncate string to max length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
export function truncate(str, maxLength) {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
