/**
 * Group Bracket Renderer for Music Notation Editor
 *
 * Renders group brackets (curly braces) for staff groupings based on line roles.
 * Uses Noto Music's MUSICAL SYMBOL BRACE (U+1D114: 𝄔) for authentic music notation.
 *
 * Line roles:
 * - melody: Independent staff line (no bracket)
 * - group-header: First line of a group (bracket starts here)
 * - group-item: Member of a group (bracket extends through these)
 */

class GroupBracketRenderer {
  constructor(editorElement) {
    this.element = editorElement;
  }

  /**
   * Render group brackets based on line roles (DOM-driven)
   * Replaces WASM-computed system blocks with user-editable roles
   */
  render() {
    // Get bracket overlay container
    const bracketOverlay = document.getElementById('bracket-overlay');
    if (!bracketOverlay) return;

    // Remove old brace overlays
    bracketOverlay.querySelectorAll('.group-brace')
      .forEach(el => el.remove());

    const lines = Array.from(this.element.querySelectorAll('.notation-line'));
    if (lines.length === 0) return;

    // Find groups: group-header followed by group-items
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const role = line.dataset.role;

      if (role === 'group-header') {
        // Collect contiguous group-item lines below
        let startIdx = i;
        let endIdx = i;

        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].dataset.role === 'group-item') {
            endIdx = j;
          } else {
            break; // Stop at non-group-item
          }
        }

        // Only draw bracket if there are group items below the header
        if (endIdx > startIdx) {
          this.drawGroupBracket(lines, startIdx, endIdx, bracketOverlay);
        }
      }
    }
  }

  /**
   * Draw a single group brace using Noto Music's curly brace (U+1D114)
   * @param {HTMLElement[]} lines - Array of line elements
   * @param {number} startIdx - Index of group-header line
   * @param {number} endIdx - Index of last group-item line
   * @param {HTMLElement} bracketOverlay - Bracket overlay container
   */
  drawGroupBracket(lines, startIdx, endIdx, bracketOverlay) {
    const firstLine = lines[startIdx];
    const lastLine = lines[endIdx];

    // Get positions relative to viewport
    const firstRect = firstLine.getBoundingClientRect();
    const lastRect = lastLine.getBoundingClientRect();

    // Get editor-section, editor-container, and notation-editor positions
    const editorSection = document.getElementById('editor-section');
    const editorContainer = document.getElementById('editor-container');
    const notationEditor = document.getElementById('notation-editor');
    if (!editorSection || !editorContainer || !notationEditor) return;

    const sectionRect = editorSection.getBoundingClientRect();
    const notationRect = notationEditor.getBoundingClientRect();

    // Account for scroll position
    const scrollTop = editorContainer.scrollTop;

    // Calculate top/bottom relative to editor-section, accounting for scroll
    const top = (firstRect.top - sectionRect.top) + scrollTop;
    const bottom = (lastRect.bottom - sectionRect.top) + scrollTop;
    const height = bottom - top;

    // Position 1em (16px) to the left of notation-editor's left edge
    const leftPosition = (notationRect.left - sectionRect.left) - 16;

    // Create curly brace using Noto Music's MUSICAL SYMBOL BRACE (U+1D114: 𝄔)
    const brace = document.createElement('span');
    brace.className = 'group-brace';
    brace.textContent = '\uD834\uDD14'; // U+1D114 (𝄔)
    brace.style.top = `${top}px`;
    brace.style.left = `${leftPosition}px`;

    // Scale brace to fit group height
    // Base height at 40px font-size ≈ 40px (measured empirically)
    const baseHeight = 40;
    const scale = height / baseHeight;
    brace.style.transform = `scaleY(${scale})`;

    bracketOverlay.appendChild(brace);
  }

  /**
   * Clear all brackets
   */
  clear() {
    const bracketOverlay = document.getElementById('bracket-overlay');
    if (bracketOverlay) {
      bracketOverlay.querySelectorAll('.group-brace')
        .forEach(el => el.remove());
    }
  }
}

export default GroupBracketRenderer;
