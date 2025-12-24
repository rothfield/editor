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
  private element: HTMLElement;

  constructor(editorElement: HTMLElement) {
    this.element = editorElement;
  }

  /**
   * Render group brackets based on line roles (DOM-driven)
   * Replaces WASM-computed system blocks with user-editable roles
   */
  render(): void {
    // Get bracket overlay container
    const bracketOverlay = document.getElementById('bracket-overlay');
    if (!bracketOverlay) return;

    // Remove old brace overlays
    bracketOverlay.querySelectorAll('.group-brace')
      .forEach(el => el.remove());

    const lines = Array.from(this.element.querySelectorAll<HTMLElement>('.notation-line'));
    if (lines.length === 0) return;

    // Batch measurements
    const editorSection = document.getElementById('editor-section');
    const editorContainer = document.getElementById('editor-container');
    const notationEditor = document.getElementById('notation-editor');
    if (!editorSection || !editorContainer || !notationEditor) return;

    const sectionRect = editorSection.getBoundingClientRect();
    const notationRect = notationEditor.getBoundingClientRect();
    const scrollTop = editorContainer.scrollTop;
    const lineRects = lines.map(line => line.getBoundingClientRect());

    const fragment = document.createDocumentFragment();
    const leftPosition = (notationRect.left - sectionRect.left) - 16;

    // Find groups: group-header followed by group-items
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const role = line.dataset.role;

      if (role === 'group-header') {
        let startIdx = i;
        let endIdx = i;

        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].dataset.role === 'group-item') {
            endIdx = j;
          } else {
            break;
          }
        }

        if (endIdx > startIdx) {
          const firstRect = lineRects[startIdx];
          const lastRect = lineRects[endIdx];

          const top = (firstRect.top - sectionRect.top) + scrollTop;
          const bottom = (lastRect.bottom - sectionRect.top) + scrollTop;
          const height = bottom - top;

          const brace = document.createElement('span');
          brace.className = 'group-brace';
          brace.textContent = '\uD834\uDD14'; // U+1D114 (𝄔)
          brace.style.top = `${top}px`;
          brace.style.left = `${leftPosition}px`;

          const baseHeight = 40;
          const scale = height / baseHeight;
          brace.style.transform = `scaleY(${scale})`;

          fragment.appendChild(brace);
        }
        i = endIdx; // Skip the rest of the group
      }
    }

    bracketOverlay.appendChild(fragment);
  }

  /**
   * Draw a single group brace using Noto Music's curly brace (U+1D114)
   * @deprecated Use batched render() instead
   */
  drawGroupBracket(
    lines: HTMLElement[],
    startIdx: number,
    endIdx: number,
    bracketOverlay: HTMLElement
  ): void {
    // This is now integrated into render() for better performance
  }

  /**
   * Clear all brackets
   */
  clear(): void {
    const bracketOverlay = document.getElementById('bracket-overlay');
    if (bracketOverlay) {
      bracketOverlay.querySelectorAll('.group-brace')
        .forEach(el => el.remove());
    }
  }
}

export default GroupBracketRenderer;
