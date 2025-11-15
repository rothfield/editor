# Editor.js Coordinator Extraction Analysis

## Overview
The MusicNotationEditor class (2920 lines) contains 86 methods that can be organized into 6 coordinator categories. Below is a detailed breakdown with line numbers and method groupings.

---

## 1. CursorCoordinator
**Responsibility**: Cursor positioning, movement validation, visual positioning, and navigation

### Methods (14 methods, ~420 lines)
| Method | Lines | Purpose |
|--------|-------|---------|
| `getCurrentStave()` | 361-371 | Get current line/stave index from WASM caret |
| `getCursorPosition()` | 385-395 | Get cursor column position |
| `getCursorPos()` | 401-414 | Get full cursor position as {line, col} object |
| `setCursorPosition()` | 424-430 | Update visual display after WASM cursor movement |
| `validateCursorPosition()` | 435-455 | Validate and clamp cursor to valid range |
| `getCursorElement()` | 1548-1570 | Get or create cursor DOM element |
| `createCursorElement()` | 1575-1607 | Create cursor element with styles and animation |
| `showCursor()` | 1523-1532 | Show cursor and start blinking |
| `hideCursor()` | 1537-1543 | Hide cursor and stop blinking |
| `updateCursorVisualPosition()` | 1650-1721 | Update cursor position relative to cells |
| `scrollCursorIntoView()` | 1726-1811 | Scroll viewport to ensure cursor visibility |
| `updateCursorPositionDisplay()` | 1817-1860 | Update UI debug display of cursor position |
| `startCursorBlinking()` | 1612-1630 | Start blinking animation with focus awareness |
| `stopCursorBlinking()` | 1635-1645 | Stop blinking animation and cleanup interval |

**Key Dependencies**: wasmModule, renderer, eventManager, display list

---

## 2. SelectionCoordinator
**Responsibility**: Selection management, text ranges, visual selection rendering, and selection validation

### Methods (13 methods, ~480 lines)
| Method | Lines | Purpose |
|--------|-------|---------|
| `clearSelection()` | 654-667 | Clear selection in WASM and update visual |
| `hasSelection()` | 673-684 | Check if active selection exists |
| `getSelection()` | 690-711 | Get current selection as {anchor, head, start, end} |
| `getSelectedText()` | 716-744 | Extract text content from selection range |
| `updateSelectionDisplay()` | 749-766 | Update visual selection and position display |
| `renderSelectionVisual()` | 772-804 | Add 'selected' class to cells in range |
| `clearSelectionVisual()` | 810-820 | Remove 'selected' class from all cells |
| `deleteSelection()` | 850-871 | Delete selected content via WASM |
| `replaceSelectedText()` | 825-845 | Replace selection with new text |
| `getVisuallySelectedCells()` | 1110-1135 | Extract cell indices from visual selection |
| `getEffectiveSelection()` | 1137-1195 | Merge visual and WASM selection info |
| `validateSelectionForCommands()` | 1196-1228 | Validate selection before operations |
| `handleSelectAll()` | 2510-2542 | Select all content in document |

**Key Dependencies**: wasmModule, renderer (DOM cells), getCurrentLine, getCurrentStave

---

## 3. ClipboardCoordinator
**Responsibility**: Copy, cut, paste operations and clipboard state management

### Methods (8 methods, ~350 lines)
| Method | Lines | Purpose |
|--------|-------|---------|
| `handleCopy()` | 2547-2606 | Copy selected cells to clipboard (WASM + system) |
| `handleCut()` | 2754-2773 | Cut selected content (copy + delete) |
| `handlePaste()` | 2775-2845 | Paste clipboard cells at cursor position |
| `updatePrimarySelection()` | 2612-2753 | Update X11 primary selection register |
| `updateDocumentFromDirtyLines()` | 2906-2920 | Merge WASM dirty lines after paste/cut |
| `handleUndo()` | 2848-2875 | Undo last operation via WASM |
| `handleRedo()` | 2877-2904 | Redo undone operation via WASM |

**Note**: Also includes undo/redo management which are closely related to clipboard operations

**Key Dependencies**: wasmModule, clipboard state, selection, navigator.clipboard API

---

## 4. InspectorCoordinator
**Responsibility**: Inspector panel updates and document export visualization

### Methods (11 methods, ~280 lines)
| Method | Lines | Purpose |
|--------|-------|---------|
| `updateDocumentDisplay()` | 1936-1998 | Route updates to visible inspector tabs |
| `updateHTMLDisplay()` | 1880-1901 | Update HTML source inspector tab |
| `formatHTML()` | 1906-1934 | Format HTML with proper indentation |
| `updateIRDisplay()` | 1865-1867 | Route to ExportManager for IR display |
| `updateMusicXMLDisplay()` | 1869-1871 | Route to ExportManager for MusicXML display |
| `updateLilyPondDisplay()` | (via ExportManager) | Route to ExportManager for LilyPond display |
| `toYAML()` | 2038-2092 | Convert object to YAML format for display |
| `createDisplayDocument()` | 2097-2139 | Transform document for display (pitch system strings) |
| `updateHitboxesDisplay()` | 2144-2211 | Display hitbox data for debugging |
| `ensureHitboxesAreSet()` | 2213-2271 | Verify hitboxes have valid coordinates |
| `forceUpdateAllExports()` | 2005-2033 | Force all exports to update regardless of visible tab |

**Key Dependencies**: ExportManager, ui.activeTab, document structure, renderer displayList

---

## 5. RenderCoordinator
**Responsibility**: DOM rendering, display updates, and visual layout synchronization

### Methods (12 methods, ~400 lines)
| Method | Lines | Purpose |
|--------|-------|---------|
| `scheduleStaffNotationUpdate()` | 1279-1300 | Schedule debounced staff notation render |
| `scheduleHitboxesUpdate()` | 1301-1380 | Schedule debounced hitbox update |
| `render()` | (via renderer) | Render document to DOM |
| `renderAndUpdate()` | (via internal) | Full render + update sequence |
| `recalculateBeats()` | (via WASM) | Recalculate beat positions after edit |
| `getCurrentLine()` | 376-383 | Get current line object for rendering |
| `getCurrentTextContent()` | 1091-1108 | Get text content of current line |
| `charPosToCellIndex()` | 581-598 | Convert character position to cell index |
| `cellIndexToCharPos()` | 599-616 | Convert cell index to character position |
| `charPosToPixel()` | 617-633 | Convert character position to pixel X |
| `cellColToPixel()` | 635-652 | Convert cell column to pixel X |
| `calculateMaxCharPosition()` | 532-542 | Calculate max position in a line |

**Key Dependencies**: renderer, displayList, WASM, layout calculations

---

## 6. ConsoleCoordinator
**Responsibility**: Console logging, error/warning display, and debug output

### Methods (11 methods, ~280 lines)
| Method | Lines | Purpose |
|--------|-------|---------|
| `showError()` | 2292-2310 | Show error message and add to console |
| `showWarning()` | 2315-2333 | Show warning message and add to console |
| `addToConsoleErrors()` | 2338-2351 | Append error to console errors tab |
| `addToConsoleWarnings()` | 2356-2366 | Append warning to console warnings tab |
| `addToConsoleLog()` | 2371-2389 | Append message to console log tab |
| `createConsoleEntry()` | 2394-2417 | Create styled console entry element |
| `showUserNotification()` | 2422-2425 | Show user notification (currently disabled) |
| `removePlaceholder()` | 2430-2437 | Remove placeholder text from console tabs |
| `limitConsoleHistory()` | 2442-2447 | Prune console history to prevent memory issues |
| `recordError()` | 2452-2469 | Record error for pattern analysis |
| `analyzeErrorPatterns()` | 2474-2488 | Detect repeated error patterns |
| `capitalizeFirst()` | 2495-2497 | Utility: capitalize string |

**Key Dependencies**: DOM elements (console tabs), errorHistory array

---

## Supporting Methods (Not Extracted)
These methods remain in the main Editor class as they are foundational or cross-cutting:

| Method | Lines | Purpose |
|--------|-------|---------|
| `constructor()` | 21-64 | Initialize editor and managers |
| `getDocument()` | 69-79 | Get document snapshot from WASM |
| `initialize()` | 91-146 | Setup editor, WASM, renderers |
| `createNewDocument()` | 150-220+ | Create empty document in WASM |
| `insertText()` | 300-360+ | Insert text via WASM (long method) |
| `handleBackspace()` | 877-944 | Delete before cursor |
| `handleDelete()` | 950-1020+ | Delete after cursor |
| `getPitchSystemName()` | 482-492 | Convert pitch system enum to string |
| `getCurrentPitchSystem()` | 499-514 | Get active pitch system |
| `getMaxCellIndex()` | 548-558 | Get max cell count in line |
| `getMaxCharPosition()` | 563-580 | Get max character position in line |
| `handleKeyboardEvent()` | 521-523 | Delegate keyboard to KeyboardHandler |
| `setupEventHandlers()` | 1381-1503 | Setup all DOM event listeners |
| `handleMouseDown()` | 1504-1507 | Delegate mouse down to MouseHandler |
| `handleMouseMove()` | 1508-1511 | Delegate mouse move to MouseHandler |
| `handleMouseUp()` | 1512-1515 | Delegate mouse up to MouseHandler |
| `handleDoubleClick()` | 1516-1522 | Handle double click for word selection |
| `showTalaDialog()` | 1246-1278 | Show tala input dialog |
| `exportMusicXML()` | 2499-2501 | Delegate to ExportManager |
| `renderStaffNotation()` | 2503-2505 | Delegate to ExportManager |

---

## Extraction Summary

### Total by Coordinator:
- **CursorCoordinator**: 14 methods (~420 lines)
- **SelectionCoordinator**: 13 methods (~480 lines)
- **ClipboardCoordinator**: 8 methods (~350 lines)
- **InspectorCoordinator**: 11 methods (~280 lines)
- **RenderCoordinator**: 12 methods (~400 lines)
- **ConsoleCoordinator**: 11 methods (~280 lines)

**Total Extractable**: 69 methods (~2,210 lines)
**Remaining in Editor**: 17 foundational/cross-cutting methods (~710 lines)

### Extraction Impact:
- Reduces main Editor class from **2920 lines to ~710 lines** (76% reduction)
- Each coordinator focused on single responsibility (~280-480 lines, manageable size)
- Clear boundaries and testability improvements
- Coordinator objects can be instantiated and tested independently

---

## Dependency Graph

```
Editor (core)
├── CursorCoordinator
│   ├── wasmModule
│   ├── renderer
│   ├── eventManager
│   └── displayList
├── SelectionCoordinator
│   ├── wasmModule
│   ├── renderer (DOM cells)
│   ├── CursorCoordinator (getCurrentLine, getCurrentStave)
│   └── getCurrentLine()
├── ClipboardCoordinator
│   ├── wasmModule
│   ├── SelectionCoordinator (hasSelection, getSelection)
│   ├── clipboard (state)
│   └── navigator.clipboard
├── InspectorCoordinator
│   ├── ExportManager
│   ├── ui.activeTab
│   ├── renderer.displayList
│   └── RenderCoordinator
├── RenderCoordinator
│   ├── renderer
│   ├── wasmModule
│   ├── displayList
│   └── layout calculations
└── ConsoleCoordinator
    ├── DOM (console tabs)
    └── errorHistory (internal state)
```

---

## Implementation Strategy

1. **Create coordinator files** in `src/js/coordinators/`:
   - `CursorCoordinator.js`
   - `SelectionCoordinator.js`
   - `ClipboardCoordinator.js`
   - `InspectorCoordinator.js`
   - `RenderCoordinator.js`
   - `ConsoleCoordinator.js`

2. **Each coordinator receives in constructor**:
   - Reference to parent Editor instance (for shared state)
   - Or pass specific dependencies only (better isolation)

3. **Update Editor class**:
   - Add coordinator instances in constructor
   - Replace method bodies with delegation calls
   - Keep foundational methods

4. **Testing**:
   - Unit test each coordinator independently
   - Update E2E tests to use new coordinator method paths
   - Verify no behavior changes

