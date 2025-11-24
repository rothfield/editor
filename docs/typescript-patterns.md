# TypeScript Type Patterns & Best Practices

This document provides practical examples of how to use TypeScript types in the music notation editor codebase.

---

## Table of Contents

1. [Using WASM Types in JavaScript (JSDoc)](#using-wasm-types-in-javascript-jsdoc)
2. [Type-Safe WASM Bridge Usage](#type-safe-wasm-bridge-usage)
3. [Document & Cell Operations](#document--cell-operations)
4. [Event Handler Patterns](#event-handler-patterns)
5. [Coordinator Type Patterns](#coordinator-type-patterns)
6. [Error Handling with Result Types](#error-handling-with-result-types)
7. [Common Pitfalls & Solutions](#common-pitfalls--solutions)

---

## Using WASM Types in JavaScript (JSDoc)

### Basic Type Imports

```javascript
/**
 * @typedef {import('@types/wasm').Cell} Cell
 * @typedef {import('@types/wasm').Document} Document
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 */

/**
 * Process a cell
 * @param {Cell} cell - The cell to process
 * @returns {string} - Processed result
 */
function processCell(cell) {
  return cell.char || '';
}
```

### Function Parameters with Type Safety

```javascript
/**
 * @typedef {import('@types/wasm').Pos} Pos
 * @typedef {import('@types/wasm').CaretInfo} CaretInfo
 */

/**
 * Move cursor to a position
 * @param {Pos} position - Target position
 * @param {boolean} extendSelection - Whether to extend selection
 * @returns {CaretInfo} - New caret information
 */
function moveCursorTo(position, extendSelection) {
  // TypeScript will validate position has line and col properties
  const { line, col } = position;
  return this.wasmModule.moveRight(extendSelection);
}
```

### Class with Typed Properties

```javascript
/**
 * @typedef {import('@types/wasm').Document} Document
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 */

export class DocumentManager {
  /**
   * @param {WASMModule} wasmModule
   */
  constructor(wasmModule) {
    /** @type {WASMModule} */
    this.wasmModule = wasmModule;

    /** @type {Document | null} */
    this.currentDocument = null;
  }

  /**
   * Load a document
   * @param {Document} doc
   * @returns {boolean}
   */
  loadDocument(doc) {
    this.wasmModule.loadDocument(doc);
    this.currentDocument = doc;
    return true;
  }

  /**
   * Get current document
   * @returns {Document | null}
   */
  getDocument() {
    return this.currentDocument;
  }
}
```

---

## Type-Safe WASM Bridge Usage

### Checking WASM Module Initialization

```javascript
import { isWASMModuleInitialized } from '@types/wasm-module';

export class Editor {
  constructor() {
    /** @type {WASMModule | null} */
    this.wasmModule = null;
  }

  /**
   * Initialize WASM module
   * @param {any} rawModule - Raw WASM from wasm-pack
   */
  async initializeWASM(rawModule) {
    if (isWASMModuleInitialized(rawModule)) {
      this.wasmModule = rawModule;
      console.log('WASM module initialized');
    } else {
      throw new Error('Invalid WASM module');
    }
  }

  /**
   * Safely call WASM function
   * @returns {string}
   */
  exportToMusicXML() {
    if (!this.wasmModule) {
      throw new Error('WASM not initialized');
    }

    // TypeScript knows wasmModule has exportMusicXML method
    return this.wasmModule.exportMusicXML();
  }
}
```

### Type-Safe WASM Function Calls

```javascript
/**
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 * @typedef {import('@types/wasm').OctaveShiftResult} OctaveShiftResult
 */

/**
 * Shift octaves in a range
 * @param {WASMModule} wasm
 * @param {number} line
 * @param {number} startCol
 * @param {number} endCol
 * @param {number} delta
 * @returns {OctaveShiftResult}
 */
function shiftOctavesInRange(wasm, line, startCol, endCol, delta) {
  const result = wasm.shiftOctave(line, startCol, endCol, delta);

  // TypeScript knows result has these properties
  if (result.success) {
    console.log(`Shifted ${result.shifted_count} notes`);
    console.log(`Skipped ${result.skipped_count} non-pitched elements`);
  }

  return result;
}
```

---

## Document & Cell Operations

### Working with Documents

```javascript
/**
 * @typedef {import('@types/wasm').Document} Document
 * @typedef {import('@types/wasm').DocumentLine} DocumentLine
 * @typedef {import('@types/wasm').PitchSystem} PitchSystem
 */

/**
 * Create a new document with default settings
 * @param {string} title
 * @param {string} composer
 * @returns {Document}
 */
function createDocument(title, composer) {
  /** @type {Document} */
  const doc = {
    title,
    composer,
    lines: [],
    pitch_system: 1, // PitchSystem.Number
    constraints: {
      default_pitch_system: 1,
      enable_ornaments: true,
      enable_slurs: true,
      enable_lyrics: true
    }
  };

  return doc;
}

/**
 * Add a line to document
 * @param {Document} doc
 * @param {string} label
 * @returns {Document}
 */
function addLine(doc, label) {
  /** @type {DocumentLine} */
  const newLine = {
    cells: [],
    label,
    pitch_system: doc.pitch_system
  };

  doc.lines.push(newLine);
  return doc;
}
```

### Cell Manipulation

```javascript
/**
 * @typedef {import('@types/wasm').Cell} Cell
 * @typedef {import('@types/wasm').ElementKind} ElementKind
 */

/**
 * Filter cells by kind
 * @param {Cell[]} cells
 * @param {ElementKind} kind
 * @returns {Cell[]}
 */
function filterCellsByKind(cells, kind) {
  return cells.filter(cell => cell.kind === kind);
}

/**
 * Get all pitched cells (notes)
 * @param {Cell[]} cells
 * @returns {Cell[]}
 */
function getPitchedCells(cells) {
  return cells.filter(cell =>
    cell.kind === 0 && // ElementKind.Pitch
    cell.pitch_code !== undefined
  );
}

/**
 * Map cells to display strings
 * @param {Cell[]} cells
 * @returns {string[]}
 */
function cellsToStrings(cells) {
  return cells.map(cell => cell.char);
}
```

---

## Event Handler Patterns

### Keyboard Event Handler with Types

```javascript
/**
 * @typedef {import('@types/events').KeyboardEventHandler} KeyboardEventHandler
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 */

/**
 * @class KeyboardHandler
 * @implements {KeyboardEventHandler}
 */
export class KeyboardHandler {
  /**
   * @param {WASMModule} wasmModule
   */
  constructor(wasmModule) {
    /** @type {WASMModule} */
    this.wasmModule = wasmModule;
  }

  /**
   * Handle key down event
   * @param {KeyboardEvent} event
   * @returns {Promise<void>}
   */
  async handleKeyDown(event) {
    const { key, shiftKey, ctrlKey, metaKey } = event;

    if (key === 'ArrowLeft') {
      this.wasmModule.moveLeft(shiftKey);
      event.preventDefault();
    } else if (key === 'ArrowRight') {
      this.wasmModule.moveRight(shiftKey);
      event.preventDefault();
    }
  }

  /**
   * Handle key up event
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  handleKeyUp(event) {
    // Handle key up
  }
}
```

### Mouse Event Handler with Types

```javascript
/**
 * @typedef {import('@types/events').MouseEventHandler} MouseEventHandler
 * @typedef {import('@types/wasm-module').MousePosition} MousePosition
 */

/**
 * @class MouseHandler
 * @implements {MouseEventHandler}
 */
export class MouseHandler {
  /**
   * Convert DOM coordinates to logical position
   * @param {MouseEvent} event
   * @returns {MousePosition}
   */
  eventToPosition(event) {
    const { clientX, clientY } = event;
    // Convert pixel coords to line/col
    return {
      line: 0,
      col: 0,
      x: clientX,
      y: clientY
    };
  }

  /**
   * Handle mouse down
   * @param {MouseEvent} event
   * @returns {void}
   */
  handleMouseDown(event) {
    const pos = this.eventToPosition(event);
    this.wasmModule.mouseDown(pos);
  }

  /**
   * Handle click
   * @param {MouseEvent} event
   * @returns {void}
   */
  handleClick(event) {
    // Handle click
  }

  /**
   * Handle mouse move
   * @param {MouseEvent} event
   * @returns {void}
   */
  handleMouseMove(event) {
    const pos = this.eventToPosition(event);
    this.wasmModule.mouseMove(pos);
  }

  /**
   * Handle mouse up
   * @param {MouseEvent} event
   * @returns {void}
   */
  handleMouseUp(event) {
    const pos = this.eventToPosition(event);
    this.wasmModule.mouseUp(pos);
  }
}
```

---

## Coordinator Type Patterns

### Cursor Coordinator

```javascript
/**
 * @typedef {import('@types/coordinators').ICursorCoordinator} ICursorCoordinator
 * @typedef {import('@types/coordinators').CursorDirection} CursorDirection
 * @typedef {import('@types/wasm').CaretInfo} CaretInfo
 * @typedef {import('@types/wasm').Pos} Pos
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 */

/**
 * @class CursorCoordinator
 * @implements {ICursorCoordinator}
 */
export class CursorCoordinator {
  /**
   * @param {WASMModule} wasmModule
   */
  constructor(wasmModule) {
    /** @type {WASMModule} */
    this.wasmModule = wasmModule;
  }

  /**
   * Get caret information
   * @returns {CaretInfo}
   */
  getCaretInfo() {
    return this.wasmModule.getCaretInfo();
  }

  /**
   * Update cursor position
   * @param {Pos} pos
   * @returns {void}
   */
  updateCursorPosition(pos) {
    // Move cursor to position
    const { line, col } = pos;
    console.log(`Moving cursor to line ${line}, col ${col}`);
  }

  /**
   * Move cursor in a direction
   * @param {CursorDirection} direction
   * @param {boolean} extend
   * @returns {void}
   */
  moveCursor(direction, extend) {
    switch (direction) {
      case 'left':
        this.wasmModule.moveLeft(extend);
        break;
      case 'right':
        this.wasmModule.moveRight(extend);
        break;
      case 'up':
        this.wasmModule.moveUp(extend);
        break;
      case 'down':
        this.wasmModule.moveDown(extend);
        break;
      case 'home':
        this.wasmModule.moveHome(extend);
        break;
      case 'end':
        this.wasmModule.moveEnd(extend);
        break;
    }
  }

  /**
   * Scroll to cursor
   * @returns {void}
   */
  scrollToCursor() {
    const caretInfo = this.getCaretInfo();
    console.log(`Scrolling to line ${caretInfo.caret.line}`);
  }
}
```

### Selection Coordinator

```javascript
/**
 * @typedef {import('@types/coordinators').ISelectionCoordinator} ISelectionCoordinator
 * @typedef {import('@types/wasm').SelectionInfo} SelectionInfo
 * @typedef {import('@types/wasm').Pos} Pos
 */

/**
 * @class SelectionCoordinator
 * @implements {ISelectionCoordinator}
 */
export class SelectionCoordinator {
  /**
   * Get selection info
   * @returns {SelectionInfo}
   */
  getSelectionInfo() {
    return this.wasmModule.getSelectionInfo();
  }

  /**
   * Set selection
   * @param {Pos} anchor
   * @param {Pos} head
   * @returns {void}
   */
  setSelection(anchor, head) {
    this.wasmModule.setSelection(anchor, head);
  }

  /**
   * Clear selection
   * @returns {void}
   */
  clearSelection() {
    this.wasmModule.clearSelection();
  }

  /**
   * Select all
   * @returns {void}
   */
  selectAll() {
    // Implement select all logic
  }

  /**
   * Select whole beat at cursor
   * @returns {void}
   */
  selectWholeBeat() {
    const caretInfo = this.wasmModule.getCaretInfo();
    const { line, col } = caretInfo.caret;
    this.wasmModule.selectWholeBeat(line, col);
  }

  /**
   * Check if there's a selection
   * @returns {boolean}
   */
  hasSelection() {
    const selInfo = this.getSelectionInfo();
    return !selInfo.is_empty;
  }
}
```

---

## Error Handling with Result Types

### Using Result Type

```javascript
/**
 * @typedef {import('@types/utils').Result} Result
 * @typedef {import('@types/wasm').Document} Document
 */

/**
 * Load document with error handling
 * @param {string} json
 * @returns {Result<Document, string>}
 */
function loadDocumentFromJSON(json) {
  try {
    const doc = JSON.parse(json);
    return { success: true, value: doc };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Use the result
 */
function processDocument() {
  const result = loadDocumentFromJSON('{ "title": "My Song" }');

  if (result.success) {
    console.log('Loaded document:', result.value.title);
  } else {
    console.error('Failed to load:', result.error);
  }
}
```

### Nullable vs Optional

```javascript
/**
 * @typedef {import('@types/utils').Nullable} Nullable
 * @typedef {import('@types/utils').Optional} Optional
 */

/**
 * Nullable example (can be null)
 * @returns {Nullable<string>}
 */
function findTitle() {
  const doc = getCurrentDocument();
  return doc ? doc.title : null;
}

/**
 * Optional example (can be undefined)
 * @param {Optional<number>} lineIndex
 * @returns {string}
 */
function getLineLabel(lineIndex) {
  if (lineIndex === undefined) {
    return 'No line selected';
  }
  return `Line ${lineIndex}`;
}
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Forgetting to Import Types

**❌ Wrong:**
```javascript
function processCell(cell) {
  return cell.char; // No type safety
}
```

**✅ Correct:**
```javascript
/**
 * @typedef {import('@types/wasm').Cell} Cell
 */

/**
 * @param {Cell} cell
 * @returns {string}
 */
function processCell(cell) {
  return cell.char; // TypeScript validates cell has 'char' property
}
```

### Pitfall 2: Using 'any' Instead of Proper Types

**❌ Wrong:**
```javascript
/**
 * @param {any} doc
 */
function saveDocument(doc) {
  // No type safety
}
```

**✅ Correct:**
```javascript
/**
 * @typedef {import('@types/wasm').Document} Document
 */

/**
 * @param {Document} doc
 */
function saveDocument(doc) {
  // TypeScript validates doc structure
}
```

### Pitfall 3: Not Checking for Null/Undefined

**❌ Wrong:**
```javascript
function exportDocument() {
  return this.wasmModule.exportMusicXML(); // Might be null!
}
```

**✅ Correct:**
```javascript
/**
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 */

/**
 * @returns {string}
 */
function exportDocument() {
  if (!this.wasmModule) {
    throw new Error('WASM module not initialized');
  }
  return this.wasmModule.exportMusicXML();
}
```

### Pitfall 4: Incorrect WASM Function Signatures

**❌ Wrong:**
```javascript
// Missing parameters
this.wasmModule.shiftOctave(0, 0); // Should have 4 parameters!
```

**✅ Correct:**
```javascript
/**
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 */

/**
 * @param {WASMModule} wasm
 */
function shiftSelection(wasm) {
  // TypeScript will error if parameters are missing
  wasm.shiftOctave(
    0,    // line
    0,    // startCol
    10,   // endCol
    1     // delta
  );
}
```

### Pitfall 5: Mutating ReadOnly Types

**❌ Wrong:**
```javascript
/**
 * @typedef {import('@types/wasm').Cell} Cell
 */

/**
 * @param {Cell} cell
 */
function badMutation(cell) {
  cell.char = 'X'; // Might violate immutability assumptions
}
```

**✅ Correct:**
```javascript
/**
 * @typedef {import('@types/wasm').Cell} Cell
 */

/**
 * Create a new cell with modified properties
 * @param {Cell} cell
 * @returns {Cell}
 */
function createModifiedCell(cell) {
  return {
    ...cell,
    char: 'X'
  };
}
```

---

## Quick Reference Card

### Common Type Imports

```javascript
// WASM Core Types
/**
 * @typedef {import('@types/wasm').Cell} Cell
 * @typedef {import('@types/wasm').Document} Document
 * @typedef {import('@types/wasm').DocumentLine} DocumentLine
 * @typedef {import('@types/wasm').Pos} Pos
 * @typedef {import('@types/wasm').CaretInfo} CaretInfo
 * @typedef {import('@types/wasm').SelectionInfo} SelectionInfo
 */

// WASM Module
/**
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 * @typedef {import('@types/wasm-module').LayoutConfig} LayoutConfig
 * @typedef {import('@types/wasm-module').DisplayList} DisplayList
 */

// Event Handlers
/**
 * @typedef {import('@types/events').KeyboardEventHandler} KeyboardEventHandler
 * @typedef {import('@types/events').MouseEventHandler} MouseEventHandler
 */

// Coordinators
/**
 * @typedef {import('@types/coordinators').ICursorCoordinator} ICursorCoordinator
 * @typedef {import('@types/coordinators').ISelectionCoordinator} ISelectionCoordinator
 */

// Utility Types
/**
 * @typedef {import('@types/utils').Result} Result
 * @typedef {import('@types/utils').Nullable} Nullable
 * @typedef {import('@types/utils').Optional} Optional
 */
```

### Type-Safe Function Template

```javascript
/**
 * @typedef {import('@types/wasm-module').WASMModule} WASMModule
 * @typedef {import('@types/wasm').Document} Document
 */

/**
 * Function description
 * @param {WASMModule} wasmModule - WASM module instance
 * @param {Document} document - Document to process
 * @returns {boolean} - Success status
 */
function myTypeSafeFunction(wasmModule, document) {
  // Implementation
  return true;
}
```

---

## Next Steps

1. **Read**: [`src/types/README.md`](../src/types/README.md) for type definitions overview
2. **Reference**: [`src/types/wasm-module.ts`](../src/types/wasm-module.ts) for complete WASM API
3. **Example**: [`src/js/core/WASMBridge.js`](../src/js/core/WASMBridge.js) for comprehensive JSDoc usage
4. **Check**: Run `npm run typecheck` to verify your types

---

## Resources

- [JSDoc Type Annotations](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [wasm-bindgen TypeScript](https://rustwasm.github.io/wasm-bindgen/reference/typescript.html)
