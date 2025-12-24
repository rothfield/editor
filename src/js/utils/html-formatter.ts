/**
 * HTML formatting utilities
 *
 * Extracted from editorHelpers.js to follow single responsibility principle.
 * Provides HTML formatting and pretty-printing for inspector panels.
 */

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

export default {
  formatHTML
};
