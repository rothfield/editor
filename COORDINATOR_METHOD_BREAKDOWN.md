# Coordinator Method Breakdown - Detailed Reference

## 1. CursorCoordinator (14 methods, ~420 lines)

### Cursor State Queries
- **`getCurrentStave()`** (361-371): Returns cursor's line index from WASM
- **`getCursorPosition()`** (385-395): Returns cursor column position only
- **`getCursorPos()`** (401-414): Returns {line, col} object (preferred for new code)

### Cursor Validation & Control
- **`validateCursorPosition(position)`** (435-455): Clamps position to [0, maxPosition]
- **`setCursorPosition(positionOrRow, col)`** (424-430): Visual update after WASM movement

### Cursor DOM Management
- **`getCursorElement()`** (1548-1570): Get/create DOM cursor element, ensure in correct line
- **`createCursorElement()`** (1575-1607): Create styled cursor div with animation styles
- **`showCursor()`** (1523-1532): Display cursor, start blinking, show visual
- **`hideCursor()`** (1537-1543): Hide cursor, stop blinking

### Cursor Visual & Animation
- **`startCursorBlinking()`** (1612-1630): Add blinking class, monitor for focus loss
- **`stopCursorBlinking()`** (1635-1645): Remove blinking class, clear interval
- **`updateCursorVisualPosition()`** (1650-1721): Update position/height based on cell metrics
- **`scrollCursorIntoView()`** (1726-1811): Scroll viewport to show cursor
- **`updateCursorPositionDisplay()`** (1817-1860): Update UI debug display (position, char count, selection)

### Extraction Notes:
- All methods query wasmModule.getCaretInfo() (WASM is source of truth)
- Pure DOM/visual operations, no document mutations
- Can be independently tested with mocked wasmModule
- Strong cohesion around cursor lifecycle

---

## 2. SelectionCoordinator (13 methods, ~480 lines)

### Selection State Queries
- **`hasSelection()`** (673-684): Check if selection exists via WASM
- **`getSelection()`** (690-711): Return {anchor, head, start, end} object
- **`getSelectedText()`** (716-744): Extract text from selection range

### Selection Commands
- **`clearSelection()`** (654-667): Clear in WASM + clear visual highlighting
- **`deleteSelection()`** (850-871): Delete selected range via WASM
- **`replaceSelectedText(newText)`** (825-845): Delete + insert text

### Selection Visual Rendering
- **`renderSelectionVisual(selection)`** (772-804): Add 'selected' class to cells in range
- **`clearSelectionVisual()`** (810-820): Remove 'selected' class from all cells
- **`updateSelectionDisplay()`** (749-766): Refresh visual + position display

### Selection Analysis & Validation
- **`getVisuallySelectedCells()`** (1110-1135): Extract cell indices from DOM selection
- **`getEffectiveSelection()`** (1137-1195): Merge visual selection with WASM selection
- **`validateSelectionForCommands()`** (1196-1228): Check selection before operations

### Global Selection
- **`handleSelectAll()`** (2510-2542): Select entire document from start to end

### Extraction Notes:
- Heavy DOM interaction (querySelectorAll, classList)
- Bidirectional sync: WASM selection ←→ DOM visual
- Depends on CursorCoordinator for line/stave access
- Clear separation of concerns: state vs visual

---

## 3. ClipboardCoordinator (8 methods, ~350 lines)

### Copy/Cut/Paste Operations
- **`handleCopy()`** (2547-2606): Copy selected cells to both system + internal clipboard
- **`handleCut()`** (2754-2773): Copy then delete selected content
- **`handlePaste()`** (2775-2845): Paste clipboard cells at cursor, update dirty lines

### Clipboard State Management
- **`updatePrimarySelection()`** (2612-2753): Sync X11 primary selection with current selection
  - Called automatically on selection changes
  - Updates WASM's internal selection register
  - 140+ lines due to cell lookup logic

### Document Update After Paste/Cut
- **`updateDocumentFromDirtyLines(dirtyLines)`** (2906-2920): Apply WASM dirty lines to document state

### Undo/Redo Operations
- **`handleUndo()`** (2848-2875): Undo via WASM, apply dirty lines
- **`handleRedo()`** (2877-2904): Redo via WASM, apply dirty lines

### Extraction Notes:
- Stores internal clipboard in this.clipboard = {text, cells}
- Uses navigator.clipboard API for system integration
- Closely tied to SelectionCoordinator (copy/cut need selection)
- Includes undo/redo due to related dirty-line handling pattern
- Heavy WASM integration (copyCells, updatePrimarySelection, deleteAtCursor, etc.)

---

## 4. InspectorCoordinator (11 methods, ~280 lines)

### Inspector Tab Routing
- **`updateDocumentDisplay()`** (1936-1998): Route updates to visible tabs only (performance optimization)
  - Checks ui.activeTab to avoid expensive operations on hidden tabs
  - Delegates to specific update methods or ExportManager

### Export Tab Updates (delegated or direct)
- **`updateIRDisplay()`** (1865-1867): Route to ExportManager
- **`updateMusicXMLDisplay()`** (1869-1871): Route to ExportManager  
- **`updateLilyPondDisplay()`** (via ExportManager): Route to ExportManager
- **`updateHTMLDisplay()`** (1880-1901): Direct update of HTML source display

### Hitbox Visualization
- **`updateHitboxesDisplay()`** (2144-2211): Generate table HTML for hitbox debugging
- **`ensureHitboxesAreSet()`** (2213-2271): Verify all cells have valid hitbox coordinates

### Display Formatting & Transformation
- **`toYAML(obj, indent)`** (2038-2092): Convert object to indented YAML text
- **`createDisplayDocument(doc)`** (2097-2139): Transform document for display (pitch system enum→string)
- **`formatHTML(html)`** (1906-1934): Format HTML with proper indentation for display

### Export Forcing
- **`forceUpdateAllExports()`** (2005-2033): Force all exports regardless of visible tab
  - Clears OSMD cache for key signature changes
  - Used when user changes pitch system or tala

### Extraction Notes:
- Light WASM usage (mostly formatting/display transformation)
- Heavy DOM manipulation (creating tables, formatting text)
- ExportManager does actual export heavy lifting
- Focused on presentation layer (converting data to UI-friendly format)
- Can be tested independently with mock document objects

---

## 5. RenderCoordinator (12 methods, ~400 lines)

### Rendering Scheduling
- **`scheduleStaffNotationUpdate()`** (1279-1300): Debounce OSMD staff notation render (100ms)
- **`scheduleHitboxesUpdate()`** (1301-1380): Debounce hitbox calculation+display (500ms)

### Rendering Helpers (position conversions)
- **`getCurrentLine()`** (376-383): Get line object for current stave
- **`getCurrentTextContent()`** (1091-1108): Get text string from current line
- **`calculateMaxCharPosition(line)`** (532-542): Sum all cell char lengths
- **`getMaxCellIndex()`** (548-558): Get cell count in current line
- **`getMaxCharPosition()`** (563-580): Get max character position in current line

### Position Conversion (character ↔ cell ↔ pixel)
- **`charPosToCellIndex(charPos)`** (581-598): Convert char position to cell index
- **`cellIndexToCharPos(cellIndex)`** (599-616): Convert cell index to char position
- **`charPosToPixel(charPos)`** (617-633): Convert char position to pixel X
- **`cellColToPixel(cellCol)`** (635-652): Convert cell column to pixel X

### Extraction Notes:
- Focused on layout calculations and measurement
- Mostly pure functions (deterministic, testable)
- Depends on renderer.displayList for pixel coordinates
- Works with WASM cells (char, x, y, w, h properties)
- Heavy use of display list calculations (iterating cells/columns)
- Scheduling uses timers for debounce (state: staffNotationTimer, hitboxesTimer)

---

## 6. ConsoleCoordinator (11 methods, ~280 lines)

### User-Facing Error/Warning Display
- **`showError(message, options)`** (2292-2310): Log error + add to console + notify + record
- **`showWarning(message, options)`** (2315-2333): Log warning + add to console + optionally notify
- **`showUserNotification(info)`** (2422-2425): Show notification popup (currently disabled)

### Console Tab Updates
- **`addToConsoleErrors(errorInfo)`** (2338-2351): Append error to console-errors-list
- **`addToConsoleWarnings(warningInfo)`** (2356-2366): Append warning to console-warnings-list
- **`addToConsoleLog(message)`** (2371-2389): Append log to console-log-list

### Console Entry Creation & Management
- **`createConsoleEntry(info, type)`** (2394-2417): Create styled div for error/warning/log
  - Formats timestamp, message, source, type
  - Includes collapsible details section
- **`removePlaceholder(container)`** (2430-2437): Remove "No logs" placeholder on first entry
- **`limitConsoleHistory(container, maxEntries)`** (2442-2447): Prune old entries to prevent memory leaks

### Error Analysis & Recording
- **`recordError(errorInfo)`** (2452-2469): Store error in this.errorHistory array (max 100)
- **`analyzeErrorPatterns()`** (2474-2488): Detect repeated errors in history (3+ occurrences)
- **`capitalizeFirst(str)`** (2495-2497): Utility function for formatting

### Extraction Notes:
- Pure DOM manipulation (createElement, appendChild, classList, innerHTML)
- Maintains internal errorHistory array (~100 items max)
- All console updates routed through single methods
- No WASM or rendering dependencies
- Fully independent and easily testable
- Text formatting focused (YAML, HTML, strings)

---

## Cross-Coordinator Interactions

### CursorCoordinator ←→ SelectionCoordinator
- SelectionCoordinator calls `getCursorPosition()`, `getCurrentStave()`, `getCurrentLine()`
- Used for selection range rendering and validation

### SelectionCoordinator ← ClipboardCoordinator
- ClipboardCoordinator calls `hasSelection()`, `getSelection()`, `getSelectedText()`
- Copy/cut operations depend on current selection

### InspectorCoordinator → RenderCoordinator + ExportManager
- Routes display updates to appropriate export manager
- Uses position conversion methods from RenderCoordinator

### All Coordinators → ConsoleCoordinator
- Call `showError()`, `showWarning()`, `addToConsoleLog()`
- For logging/debug output

### RenderCoordinator (scheduling) → ExportManager
- `scheduleStaffNotationUpdate()` calls to update staff notation
- `scheduleHitboxesUpdate()` calls renderer update

---

## Shared State Passed to All Coordinators

Constructor injection pattern:
```javascript
class CursorCoordinator {
  constructor(editor) {
    this.editor = editor;  // Full reference to parent
    // Or: specific dependencies
    this.wasmModule = editor.wasmModule;
    this.renderer = editor.renderer;
    this.element = editor.element;
    this.ui = editor.ui;
  }
}
```

### Shared Resources:
- **wasmModule**: Document operations, cursor/selection queries, cell data
- **renderer**: DOM element access, displayList (layout data)
- **element**: Root editor container for querying notation-line elements
- **ui**: Track which inspector tab is active (for performance optimization)
- **displayList**: Cached layout info (cell positions, dimensions)
- **clipboard**: Shared state for copy/paste (stores text + cells)
- **errorHistory**: Shared error recording array

---

## Migration Strategy

### Phase 1: Create Coordinator Classes
1. Create `src/js/coordinators/` directory
2. Create each coordinator.js file with methods extracted
3. Keep Editor class mostly intact (add coordinator instances)

### Phase 2: Update Editor Constructor
```javascript
this.cursorCoordinator = new CursorCoordinator(this);
this.selectionCoordinator = new SelectionCoordinator(this);
// ... etc
```

### Phase 3: Replace Methods with Delegation
```javascript
// In Editor class
getCursorPosition() {
  return this.cursorCoordinator.getCursorPosition();
}

// Or remove entirely if only internal use in coordinator
```

### Phase 4: Testing
- Unit test each coordinator independently
- E2E tests should still pass (method names unchanged)
- Add integration tests for coordinator interactions

---

## Method Counts by Responsibility

| Type | Count | Examples |
|------|-------|----------|
| Queries (read state) | 16 | getCursorPosition, hasSelection, getSelectedText |
| Commands (mutate state) | 18 | deleteSelection, handleCopy, clearSelection |
| Visual Updates (DOM) | 15 | renderSelectionVisual, updateCursorVisualPosition |
| Conversions (pure functions) | 12 | charPosToPixel, toYAML, createDisplayDocument |
| Scheduling (timers) | 2 | scheduleStaffNotationUpdate, scheduleHitboxesUpdate |
| Console/Logging (UI) | 6 | showError, addToConsoleLog, analyzeErrorPatterns |

