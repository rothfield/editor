# Refactoring Analysis: `/home/john/editor/src/js/editor.js`

**Analysis Date:** 2025-11-18
**File Size:** ~2983 lines
**Class:** `MusicNotationEditor`

---

## Executive Summary

The `editor.js` file is in a **transitional state** between an old monolithic architecture and a new coordinator-based architecture. This creates confusion because:

1. **Duplicate methods exist** - Full implementations (lines 1-2930) AND delegate stubs (lines 2939-2979)
2. **Mixed responsibilities** - Some logic lives in Editor, some in Coordinators
3. **Unclear which version runs** - Does calling `editor.showCursor()` run the local implementation or delegate to CursorCoordinator?

**Recommended Action:** Complete the coordinator migration aggressively - move ALL implementations to coordinators, keep ONLY delegates in Editor.

---

## 1. Method Inventory

### Total Methods: ~150+

### Method Categories:

#### A. **Cursor Management** (16 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `getCursorPosition()` | 459-469 | Editor (impl) | ✅ Has delegate (2940) |
| `getCursorPos()` | 475-488 | Editor (impl) | ✅ Has delegate (2941) |
| `setCursorPosition()` | 498-504 | Editor (impl) | ✅ Has delegate (2942) |
| `validateCursorPosition()` | 509-529 | Editor (impl) | ✅ Has delegate (2943) |
| `updateCursorFromWASM()` | 536-550 | Editor (impl) | ✅ Has delegate (2944) |
| `showCursor()` | 1606-1615 | Editor (impl) | ✅ Has delegate (2945) |
| `hideCursor()` | 1620-1626 | Editor (impl) | ✅ Has delegate (2946) |
| `updateCursorVisualPosition()` | 1733-1804 | Editor (impl) | ✅ Has delegate (2947) |
| `updateCursorPositionDisplay()` | N/A | **ONLY in delegate** (2948) | ⚠️ Missing impl |
| `getCursorElement()` | 1631-1653 | Editor only | ❌ No delegate |
| `createCursorElement()` | 1658-1690 | Editor only | ❌ No delegate |
| `startCursorBlinking()` | 1695-1713 | Editor only | ❌ No delegate |
| `stopCursorBlinking()` | 1718-1728 | Editor only | ❌ No delegate |
| `scrollCursorIntoView()` | 1809-1894 | Editor only | ❌ No delegate |
| `getCurrentStave()` | 435-445 | Editor only | ❌ No delegate |
| `getCurrentLine()` | 450-457 | Editor only | ❌ No delegate |

**Status:** PARTIALLY MIGRATED - Core methods delegated, but helper methods still in Editor

---

#### B. **Selection Management** (12 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `clearSelection()` | 728-741 | Editor (impl) | ✅ Has delegate (2951) |
| `hasSelection()` | 747-758 | Editor (impl) | ✅ Has delegate (2952) |
| `getSelection()` | 764-785 | Editor (impl) | ✅ Has delegate (2953) |
| `getSelectedText()` | 790-818 | Editor (impl) | ✅ Has delegate (2954) |
| `updateSelectionDisplay()` | 823-840 | Editor (impl) | ✅ Has delegate (2955) |
| `updatePrimarySelection()` | 2628-2677 | Editor (impl) | ✅ Has delegate (2956) |
| `renderSelectionVisual()` | 846-878 | Editor only | ❌ No delegate |
| `clearSelectionVisual()` | 884-894 | Editor only | ❌ No delegate |
| `getVisuallySelectedCells()` | 1184-1204 | Editor only | ❌ No delegate |
| `getEffectiveSelection()` | 1211-1268 | Editor only | ❌ No delegate |
| `validateSelectionForCommands()` | 1270-1305 | Editor only | ❌ No delegate |
| `replaceSelectedText()` | 899-918 | Editor only | ❌ No delegate |
| `deleteSelection()` | 924-945 | Editor only | ❌ No delegate |

**Status:** PARTIALLY MIGRATED - Query methods delegated, but manipulation methods still in Editor

---

#### C. **Clipboard Operations** (5 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `handleCopy()` | 2563-2622 | Editor (impl) | ✅ Has delegate (2959) |
| `handleCut()` | 2770-2786 | Editor (impl) | ✅ Has delegate (2960) |
| `handlePaste()` | 2791-2859 | Editor (impl) | ✅ Has delegate (2961) |
| `handleMiddleClick()` | 2683-2765 | Editor (impl) | ✅ Has delegate (2962) |
| `handleSelectAll()` | 2526-2558 | Editor only | ❌ No delegate |

**Status:** MOSTLY MIGRATED - Major clipboard operations delegated, SelectAll missing

---

#### D. **Rendering & Display** (10 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `render()` | 1394-1449 | Editor (impl) | ✅ Has delegate (2965) |
| `renderAndUpdate()` | 1456-1459 | Editor (impl) | ✅ Has delegate (2966) |
| `charPosToCellIndex()` | 655-665 | Editor (impl) | ✅ Has delegate (2967) |
| `cellIndexToCharPos()` | 673-684 | Editor (impl) | ✅ Has delegate (2968) |
| `charPosToPixel()` | 691-702 | Editor (impl) | ✅ Has delegate (2969) |
| `cellColToPixel()` | 709-720 | Editor (impl) | ✅ Has delegate (2970) |
| `ensureHitboxesAreSet()` | 2253-2303 | Editor only | ❌ No delegate |
| `updateHitboxesDisplay()` | 2184-2246 | Editor only | ❌ No delegate |
| `scheduleStaffNotationUpdate()` | 1356-1376 | Editor only | ❌ No delegate |
| `scheduleHitboxesUpdate()` | 1378-1388 | Editor only | ❌ No delegate |

**Status:** MOSTLY MIGRATED - Position conversion delegated, scheduling still in Editor

---

#### E. **Inspector/Export** (8 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `updateDocumentDisplay()` | 1976-2038 | Editor (impl) | ✅ Has delegate (2973) |
| `forceUpdateAllExports()` | 2045-2073 | Editor (impl) | ✅ Has delegate (2974) |
| `updateIRDisplay()` | 1903-1905 | Editor only | ❌ No delegate |
| `updateMusicXMLDisplay()` | 1907-1909 | Editor only | ❌ No delegate |
| `updateLilyPondDisplay()` | 1911-1913 | Editor only | ❌ No delegate |
| `updateHTMLDisplay()` | 1920-1941 | Editor only | ❌ No delegate (deprecated) |
| `exportMusicXML()` | 2515-2517 | Editor only | ❌ No delegate |
| `renderStaffNotation()` | 2519-2521 | Editor only | ❌ No delegate |

**Status:** PARTIALLY MIGRATED - High-level updates delegated, individual tabs still in Editor

---

#### F. **Console/Error Handling** (12 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `showError()` | 2308-2326 | Editor (impl) | ✅ Has delegate (2977) |
| `showWarning()` | 2331-2349 | Editor (impl) | ✅ Has delegate (2978) |
| `addToConsoleLog()` | 2387-2405 | Editor (impl) | ✅ Has delegate (2979) |
| `addToConsoleErrors()` | 2354-2367 | Editor only | ❌ No delegate |
| `addToConsoleWarnings()` | 2372-2382 | Editor only | ❌ No delegate |
| `createConsoleEntry()` | 2410-2433 | Editor only | ❌ No delegate |
| `showUserNotification()` | 2438-2441 | Editor only | ❌ No delegate (disabled) |
| `removePlaceholder()` | 2446-2453 | Editor only | ❌ No delegate |
| `limitConsoleHistory()` | 2458-2463 | Editor only | ❌ No delegate |
| `recordError()` | 2468-2485 | Editor only | ❌ No delegate |
| `analyzeErrorPatterns()` | 2490-2504 | Editor only | ❌ No delegate |
| `capitalizeFirst()` | 2511-2513 | Editor only | ❌ No delegate |

**Status:** PARTIALLY MIGRATED - High-level error display delegated, helpers still in Editor

---

#### G. **Document Management** (8 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `getDocument()` | 85-95 | Editor only | ❌ No delegate (core) |
| `initialize()` | 135-220 | Editor only | ❌ No delegate (core) |
| `createNewDocument()` | 226-239 | Editor only | ❌ No delegate |
| `loadDocument()` | 245-274 | Editor only | ❌ No delegate |
| `saveDocument()` | 280-292 | Editor only | ❌ No delegate |
| `loadNotationFont()` | 113-130 | Editor only | ❌ No delegate (unused) |
| `createDisplayDocument()` | 2137-2179 | Editor only | ❌ No delegate |
| `toYAML()` | 2078-2132 | Editor only | ❌ No delegate |

**Status:** NOT MIGRATED - Core lifecycle methods stay in Editor (appropriate)

---

#### H. **Text Editing** (8 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `insertText()` | 298-367 | Editor only | ❌ No delegate (core) |
| `deleteRange()` | 373-427 | Editor only | ❌ No delegate |
| `handleBackspace()` | 951-1018 | Editor only | ❌ No delegate |
| `handleDelete()` | 1024-1085 | Editor only | ❌ No delegate |
| `handleEnter()` | 1090-1144 | Editor only | ❌ No delegate |
| `handleKeyboardEvent()` | 595-597 | Editor only | ❌ No delegate (delegates to handler) |
| `recalculateBeats()` | 1149-1160 | Editor only | ❌ No delegate |
| `getCurrentTextContent()` | 1165-1175 | Editor only | ❌ No delegate |

**Status:** NOT MIGRATED - Core editing logic stays in Editor (appropriate for now)

---

#### I. **Position Calculations** (6 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `calculateMaxCharPosition()` | 606-616 | Editor only | ❌ No delegate |
| `getMaxCellIndex()` | 622-633 | Editor only | ❌ No delegate |
| `getMaxCharPosition()` | 637-648 | Editor only | ❌ No delegate |
| `charPosToCellIndex()` | 655-665 | Editor (impl) | ✅ Delegated to RenderCoordinator |
| `cellIndexToCharPos()` | 673-684 | Editor (impl) | ✅ Delegated to RenderCoordinator |
| `charPosToPixel()` | 691-702 | Editor (impl) | ✅ Delegated to RenderCoordinator |
| `cellColToPixel()` | 709-720 | Editor (impl) | ✅ Delegated to RenderCoordinator |

**Status:** PARTIALLY MIGRATED - Pixel conversion delegated, max position calculations still in Editor

---

#### J. **Event Handling** (8 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `setupEventHandlers()` | 1464-1582 | Editor only | ❌ No delegate (core) |
| `handleMouseDown()` | 1587-1589 | Editor only | ❌ Delegates to MouseHandler |
| `handleMouseMove()` | 1591-1593 | Editor only | ❌ Delegates to MouseHandler |
| `handleMouseUp()` | 1595-1597 | Editor only | ❌ Delegates to MouseHandler |
| `handleDoubleClick()` | 1599-1601 | Editor only | ❌ Delegates to MouseHandler |
| `handleUndo()` | 2864-2888 | Editor only | ❌ No delegate |
| `handleRedo()` | 2893-2917 | Editor only | ❌ No delegate |
| `updateDocumentFromDirtyLines()` | 2922-2930 | Editor only | ❌ No delegate (stub) |

**Status:** NOT MIGRATED - Event routing stays in Editor (appropriate)

---

#### K. **Pitch System & Musical** (4 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `getPitchSystemName()` | 556-566 | Editor only | ❌ No delegate |
| `getCurrentPitchSystem()` | 573-588 | Editor only | ❌ No delegate |
| `showTalaDialog()` | 1320-1325 | Editor only | ❌ No delegate |
| `setTala()` | 1330-1350 | Editor only | ❌ No delegate |

**Status:** NOT MIGRATED - Musical logic stays in Editor (could be extracted to MusicalCoordinator)

---

#### L. **Utility/Display** (4 methods)
| Method | Lines | Location | Status |
|--------|-------|----------|--------|
| `formatHTML()` | 1946-1974 | Editor only | ❌ No delegate |
| `toYAML()` | 2078-2132 | Editor only | ❌ No delegate |
| `createDisplayDocument()` | 2137-2179 | Editor only | ❌ No delegate |
| `capitalizeFirst()` | 2511-2513 | Editor only | ❌ No delegate |

**Status:** NOT MIGRATED - Utility methods stay in Editor (could be extracted to utils)

---

## 2. Duplicate Method Definitions

### Critical Issue: Conflicting Implementations

**Problem:** Methods are defined TWICE - once with full implementation, once as delegate stub.

**Which version runs?**

JavaScript uses **last definition wins** - so the delegate stubs at lines 2939-2979 **override** the full implementations earlier in the file.

#### Confirmed Duplicates (Full Implementation + Delegate):

| Method | Full Implementation | Delegate Stub | Currently Active |
|--------|---------------------|---------------|------------------|
| `getCursorPosition()` | 459-469 | 2940 | **Delegate** (forwards to coordinator) |
| `getCursorPos()` | 475-488 | 2941 | **Delegate** (forwards to coordinator) |
| `setCursorPosition()` | 498-504 | 2942 | **Delegate** (forwards to coordinator) |
| `validateCursorPosition()` | 509-529 | 2943 | **Delegate** (forwards to coordinator) |
| `updateCursorFromWASM()` | 536-550 | 2944 | **Delegate** (forwards to coordinator) |
| `showCursor()` | 1606-1615 | 2945 | **Delegate** (forwards to coordinator) |
| `hideCursor()` | 1620-1626 | 2946 | **Delegate** (forwards to coordinator) |
| `updateCursorVisualPosition()` | 1733-1804 | 2947 | **Delegate** (forwards to coordinator) |
| `clearSelection()` | 728-741 | 2951 | **Delegate** (forwards to coordinator) |
| `hasSelection()` | 747-758 | 2952 | **Delegate** (forwards to coordinator) |
| `getSelection()` | 764-785 | 2953 | **Delegate** (forwards to coordinator) |
| `getSelectedText()` | 790-818 | 2954 | **Delegate** (forwards to coordinator) |
| `updateSelectionDisplay()` | 823-840 | 2955 | **Delegate** (forwards to coordinator) |
| `updatePrimarySelection()` | 2628-2677 | 2956 | **Delegate** (forwards to coordinator) |
| `handleCopy()` | 2563-2622 | 2959 | **Delegate** (forwards to coordinator) |
| `handleCut()` | 2770-2786 | 2960 | **Delegate** (forwards to coordinator) |
| `handlePaste()` | 2791-2859 | 2961 | **Delegate** (forwards to coordinator) |
| `handleMiddleClick()` | 2683-2765 | 2962 | **Delegate** (forwards to coordinator) |
| `render()` | 1394-1449 | 2965 | **Delegate** (forwards to coordinator) |
| `renderAndUpdate()` | 1456-1459 | 2966 | **Delegate** (forwards to coordinator) |
| `charPosToCellIndex()` | 655-665 | 2967 | **Delegate** (forwards to coordinator) |
| `cellIndexToCharPos()` | 673-684 | 2968 | **Delegate** (forwards to coordinator) |
| `charPosToPixel()` | 691-702 | 2969 | **Delegate** (forwards to coordinator) |
| `cellColToPixel()` | 709-720 | 2970 | **Delegate** (forwards to coordinator) |
| `updateDocumentDisplay()` | 1976-2038 | 2973 | **Delegate** (forwards to coordinator) |
| `forceUpdateAllExports()` | 2045-2073 | 2974 | **Delegate** (forwards to coordinator) |
| `showError()` | 2308-2326 | 2977 | **Delegate** (forwards to coordinator) |
| `showWarning()` | 2331-2349 | 2978 | **Delegate** (forwards to coordinator) |
| `addToConsoleLog()` | 2387-2405 | 2979 | **Delegate** (forwards to coordinator) |

**Total Duplicates:** 29 methods

**Impact:**
- **Dead code:** Lines 459-2677 contain implementations that NEVER RUN
- **Confusion:** Developers don't know which version to modify
- **Maintenance burden:** Changes must be synchronized between Editor and Coordinators

---

## 3. Code Smells & Issues

### A. **Very Long Methods (>100 lines)**

| Method | Lines | Length | Issue |
|--------|-------|--------|-------|
| `initialize()` | 135-220 | 85 lines | Complex initialization logic, but acceptable |
| `insertText()` | 298-367 | 69 lines | Performance logging bloat |
| `deleteRange()` | 373-427 | 54 lines | Acceptable |
| `handleBackspace()` | 951-1018 | 67 lines | Could be simplified |
| `handleDelete()` | 1024-1085 | 61 lines | Similar to handleBackspace, DRY violation |
| `setupEventHandlers()` | 1464-1582 | 118 lines | **TOO LONG** - Extract event setup to modules |
| `updateCursorVisualPosition()` | 1733-1804 | 71 lines | Complex positioning logic |
| `scrollCursorIntoView()` | 1809-1894 | 85 lines | Complex scrolling logic |
| `updateDocumentDisplay()` | 1976-2038 | 62 lines | Many conditional updates |
| `toYAML()` | 2078-2132 | 54 lines | Acceptable for serialization |
| `updateHitboxesDisplay()` | 2184-2246 | 62 lines | HTML generation, could extract template |
| `ensureHitboxesAreSet()` | 2253-2303 | 50 lines | Fallback hitbox calculation |
| `handleCopy()` | 2563-2622 | 59 lines | Complex clipboard logic |
| `updatePrimarySelection()` | 2628-2677 | 49 lines | Duplicates handleCopy logic |
| `handleMiddleClick()` | 2683-2765 | 82 lines | Long event handler |
| `handlePaste()` | 2791-2859 | 68 lines | Complex paste logic |

**Recommendation:**
- `setupEventHandlers()` should be split into:
  - `setupKeyboardEvents()`
  - `setupMouseEvents()`
  - `setupFocusEvents()`
  - `setupClipboardEvents()`

---

### B. **Methods That Should Be in WASM**

Per CLAUDE.md WASM-first architecture, these methods contain business logic that should be in Rust:

| Method | Lines | Reason |
|--------|-------|--------|
| `validateCursorPosition()` | 509-529 | Cursor position validation is business logic |
| `calculateMaxCharPosition()` | 606-616 | Position calculation should be in WASM |
| `getMaxCellIndex()` | 622-633 | Document structure query |
| `getMaxCharPosition()` | 637-648 | Position calculation |
| `ensureHitboxesAreSet()` | 2253-2303 | Layout calculations should be in WASM |
| `getEffectiveSelection()` | 1211-1268 | Selection logic is business logic |
| `validateSelectionForCommands()` | 1270-1305 | Validation is business logic |

**Recommendation:** Move these to WASM, expose simple query functions to JavaScript.

---

### C. **Dead/Commented Code**

| Location | Lines | Issue |
|----------|-------|-------|
| `loadNotationFont()` | 113-130 | **UNUSED** - Comment says "Currently NOT USED" |
| `updateHTMLDisplay()` | 1920-1941 | **DEPRECATED** - Comment says "now UNUSED" |
| `updateDocumentFromDirtyLines()` | 2922-2930 | **STUB** - Empty implementation, comment says WASM owns state |
| Debug logging | 1999-2002 | Commented debug logs in `updateDocumentDisplay()` |
| `showUserNotification()` | 2438-2441 | **DISABLED** - Just logs to console |

**Recommendation:**
- Remove `loadNotationFont()` entirely (dead code)
- Remove `updateHTMLDisplay()` (replaced by InspectorCoordinator)
- Remove `updateDocumentFromDirtyLines()` (no longer needed)
- Clean up commented debug logs

---

### D. **Inconsistent Patterns**

#### Pattern 1: WASM Sync Checks (Redundant)
Many methods have this pattern:
```javascript
// CRITICAL: Ensure WASM document is in sync before pasting
try {
  // WASM already has document internally - no need to load
} catch (e) {
  console.warn('Failed to sync document with WASM before paste:', e);
}
```

**Issue:** The try-catch does NOTHING - empty try block. This is leftover from old architecture.

**Locations:**
- Line 2577 (handleCopy)
- Line 2639 (updatePrimarySelection)
- Line 2692 (handleMiddleClick)
- Line 2798 (handlePaste)

**Recommendation:** Remove these empty sync blocks.

#### Pattern 2: Duplicate Selection Logic
`updatePrimarySelection()` (2628-2677) duplicates logic from `handleCopy()` (2563-2622).

**Recommendation:** Extract common logic to a shared method.

#### Pattern 3: Inconsistent Error Handling
- Some methods use `this.showError()` (goes through ConsoleCoordinator)
- Some methods use `console.error()` directly
- Some methods use both

**Recommendation:** Standardize on `this.showError()` for user-facing errors, `console.error()` for internal debugging.

---

## 4. Coordinator Usage Analysis

### Existing Coordinators:

| Coordinator | Responsibilities | Status |
|-------------|------------------|--------|
| **CursorCoordinator** | Cursor position, visual display, blinking, scrolling | ✅ Partially used |
| **SelectionCoordinator** | Selection queries, display updates, primary selection | ✅ Partially used |
| **ClipboardCoordinator** | Copy, cut, paste, middle-click | ✅ Partially used |
| **RenderCoordinator** | Rendering, position conversions | ✅ Partially used |
| **InspectorCoordinator** | Inspector tab updates, export display | ✅ Partially used |
| **ConsoleCoordinator** | Error/warning/log display | ✅ Partially used |

### What Should Each Coordinator Handle?

#### CursorCoordinator (lines 2940-2948)
**Currently delegates:** 9 methods
**Missing from coordinator:**
- `getCursorElement()` (1631-1653)
- `createCursorElement()` (1658-1690)
- `startCursorBlinking()` (1695-1713)
- `stopCursorBlinking()` (1718-1728)
- `scrollCursorIntoView()` (1809-1894)
- `getCurrentStave()` (435-445)
- `getCurrentLine()` (450-457)

**Recommendation:** Move these to CursorCoordinator

#### SelectionCoordinator (lines 2951-2956)
**Currently delegates:** 6 methods
**Missing from coordinator:**
- `renderSelectionVisual()` (846-878)
- `clearSelectionVisual()` (884-894)
- `getVisuallySelectedCells()` (1184-1204)
- `getEffectiveSelection()` (1211-1268)
- `validateSelectionForCommands()` (1270-1305)
- `replaceSelectedText()` (899-918)
- `deleteSelection()` (924-945)

**Recommendation:** Move these to SelectionCoordinator

#### ClipboardCoordinator (lines 2959-2962)
**Currently delegates:** 4 methods
**Missing from coordinator:**
- `handleSelectAll()` (2526-2558) - Should be in SelectionCoordinator, not ClipboardCoordinator

**Recommendation:** Move SelectAll to SelectionCoordinator

#### RenderCoordinator (lines 2965-2970)
**Currently delegates:** 6 methods
**Missing from coordinator:**
- `ensureHitboxesAreSet()` (2253-2303)
- `updateHitboxesDisplay()` (2184-2246)
- `scheduleStaffNotationUpdate()` (1356-1376)
- `scheduleHitboxesUpdate()` (1378-1388)
- `calculateMaxCharPosition()` (606-616)
- `getMaxCellIndex()` (622-633)
- `getMaxCharPosition()` (637-648)

**Recommendation:** Move these to RenderCoordinator

#### InspectorCoordinator (lines 2973-2974)
**Currently delegates:** 2 methods
**Missing from coordinator:**
- `updateIRDisplay()` (1903-1905)
- `updateMusicXMLDisplay()` (1907-1909)
- `updateLilyPondDisplay()` (1911-1913)
- `updateHTMLDisplay()` (1920-1941) - Can be removed (deprecated)
- `exportMusicXML()` (2515-2517)
- `renderStaffNotation()` (2519-2521)
- `toYAML()` (2078-2132)
- `createDisplayDocument()` (2137-2179)
- `formatHTML()` (1946-1974)

**Recommendation:** Move these to InspectorCoordinator or ExportManager

#### ConsoleCoordinator (lines 2977-2979)
**Currently delegates:** 3 methods
**Missing from coordinator:**
- `addToConsoleErrors()` (2354-2367)
- `addToConsoleWarnings()` (2372-2382)
- `createConsoleEntry()` (2410-2433)
- `removePlaceholder()` (2446-2453)
- `limitConsoleHistory()` (2458-2463)
- `recordError()` (2468-2485)
- `analyzeErrorPatterns()` (2490-2504)
- `showUserNotification()` (2438-2441)

**Recommendation:** Move these to ConsoleCoordinator

---

## 5. Refactoring Recommendations

### Phase 1: Remove Dead Code (Immediate, Low Risk)

1. **Delete unused methods:**
   - `loadNotationFont()` (113-130)
   - `updateHTMLDisplay()` (1920-1941)
   - `updateDocumentFromDirtyLines()` (2922-2930)
   - `showUserNotification()` (2438-2441) - or restore functionality

2. **Remove empty WASM sync blocks:**
   - Lines 2577-2581 (handleCopy)
   - Lines 2639-2644 (updatePrimarySelection)
   - Lines 2692-2693 (handleMiddleClick)
   - Lines 2798-2803 (handlePaste)

3. **Clean up commented debug logs:**
   - Lines 1999-2002 (updateDocumentDisplay)

**Estimated Impact:** Remove ~100 lines of dead code

---

### Phase 2: Complete Coordinator Migration (Medium Risk)

**Strategy:** Move ALL implementations to coordinators, keep ONLY delegate stubs in Editor.

#### Step 1: Move Cursor Methods to CursorCoordinator
```javascript
// In CursorCoordinator:
getCursorElement()
createCursorElement()
startCursorBlinking()
stopCursorBlinking()
scrollCursorIntoView()
getCurrentStave()
getCurrentLine()
```

**Delete from Editor:** Lines 1631-1894

#### Step 2: Move Selection Methods to SelectionCoordinator
```javascript
// In SelectionCoordinator:
renderSelectionVisual()
clearSelectionVisual()
getVisuallySelectedCells()
getEffectiveSelection()
validateSelectionForCommands()
replaceSelectedText()
deleteSelection()
handleSelectAll()  // Move from clipboard
```

**Delete from Editor:** Lines 846-945, 1184-1305, 2526-2558

#### Step 3: Move Render Methods to RenderCoordinator
```javascript
// In RenderCoordinator:
ensureHitboxesAreSet()
updateHitboxesDisplay()
scheduleStaffNotationUpdate()
scheduleHitboxesUpdate()
calculateMaxCharPosition()
getMaxCellIndex()
getMaxCharPosition()
```

**Delete from Editor:** Lines 606-648, 1356-1388, 2184-2303

#### Step 4: Move Inspector Methods to InspectorCoordinator
```javascript
// In InspectorCoordinator:
updateIRDisplay()
updateMusicXMLDisplay()
updateLilyPondDisplay()
exportMusicXML()
renderStaffNotation()
toYAML()
createDisplayDocument()
formatHTML()
```

**Delete from Editor:** Lines 1903-1913, 1946-1974, 2078-2179, 2515-2521

#### Step 5: Move Console Methods to ConsoleCoordinator
```javascript
// In ConsoleCoordinator:
addToConsoleErrors()
addToConsoleWarnings()
createConsoleEntry()
removePlaceholder()
limitConsoleHistory()
recordError()
analyzeErrorPatterns()
capitalizeFirst()  // Utility
```

**Delete from Editor:** Lines 2354-2504, 2511-2513

**Estimated Impact:** Reduce Editor from ~2983 lines to ~1500 lines

---

### Phase 3: Extract New Coordinators (Low Priority)

#### MusicalCoordinator
Handle pitch system, tala, key signatures:
```javascript
getPitchSystemName()
getCurrentPitchSystem()
showTalaDialog()
setTala()
```

#### UtilityCoordinator or Utils Module
Extract pure utility functions:
```javascript
capitalizeFirst()
formatHTML()
toYAML()
```

---

### Phase 4: Simplify Event Handlers (Medium Risk)

Split `setupEventHandlers()` (1464-1582) into focused methods:

```javascript
setupKeyboardEvents() {
  // Keyboard event delegation
}

setupMouseEvents() {
  // Mouse down/move/up/double-click
}

setupFocusEvents() {
  // Focus/blur
}

setupClipboardEvents() {
  // beforeunload, autosave
}
```

**Estimated Impact:** Split 118 lines into 4 focused methods

---

### Phase 5: Move Business Logic to WASM (High Risk, High Value)

Per WASM-first architecture, move these to Rust:

1. **Position Calculations:**
   - `validateCursorPosition()`
   - `calculateMaxCharPosition()`
   - `getMaxCellIndex()`
   - `getMaxCharPosition()`

2. **Layout Calculations:**
   - `ensureHitboxesAreSet()` - Should be in WASM layout engine

3. **Selection Logic:**
   - `getEffectiveSelection()`
   - `validateSelectionForCommands()`

**Estimated Impact:**
- Reduce JavaScript complexity
- Improve performance (Rust is faster)
- Enable better testing (Rust has better unit testing)
- Follow architecture guidelines

---

## 6. Migration Checklist

### Immediate Actions (This Week):
- [ ] Remove `loadNotationFont()` (dead code)
- [ ] Remove `updateHTMLDisplay()` (deprecated)
- [ ] Remove `updateDocumentFromDirtyLines()` (stub)
- [ ] Remove empty WASM sync blocks (lines 2577, 2639, 2692, 2798)
- [ ] Clean up commented debug logs (line 1999-2002)

### Short Term (Next 2 Weeks):
- [ ] Move all cursor methods to CursorCoordinator
- [ ] Move all selection methods to SelectionCoordinator
- [ ] Move all render helpers to RenderCoordinator
- [ ] Move all inspector methods to InspectorCoordinator
- [ ] Move all console helpers to ConsoleCoordinator
- [ ] Delete duplicate implementations from Editor (keep only delegates)
- [ ] Test thoroughly after each coordinator migration

### Medium Term (Next Month):
- [ ] Split `setupEventHandlers()` into focused methods
- [ ] Extract MusicalCoordinator for pitch system logic
- [ ] Extract utility methods to Utils module
- [ ] Consolidate duplicate clipboard logic (handleCopy vs updatePrimarySelection)
- [ ] Standardize error handling patterns

### Long Term (Next Quarter):
- [ ] Move position calculations to WASM
- [ ] Move layout calculations to WASM
- [ ] Move selection logic to WASM
- [ ] Add comprehensive tests for coordinators
- [ ] Document coordinator architecture in ARCHITECTURE.md

---

## 7. File Structure After Refactoring

### Target Structure:
```
src/js/editor.js                     (~1500 lines)
  - Constructor, initialization
  - Document lifecycle (create, load, save)
  - Core editing (insertText, deleteRange, handleBackspace/Delete/Enter)
  - Event routing (handleKeyboardEvent, mouse events)
  - Undo/redo
  - Delegate stubs ONLY (lines 2939-2979)

src/js/coordinators/
  CursorCoordinator.js               (~300 lines)
  SelectionCoordinator.js            (~400 lines)
  ClipboardCoordinator.js            (~200 lines)
  RenderCoordinator.js               (~500 lines)
  InspectorCoordinator.js            (~600 lines)
  ConsoleCoordinator.js              (~300 lines)
  MusicalCoordinator.js (NEW)        (~150 lines)

src/js/utils/
  formatting.js (toYAML, formatHTML) (~150 lines)
  validation.js (cursor, selection)   (~100 lines)
```

**Total lines:** ~4100 lines (vs current ~2983 + coordinator implementations)

**Benefits:**
- Clear separation of concerns
- Easier to test individual coordinators
- No duplicate code
- Easier to find functionality
- Easier to onboard new developers

---

## 8. Risk Assessment

| Refactoring Phase | Risk Level | Mitigation |
|-------------------|------------|------------|
| Remove dead code | **LOW** | Unused code has no callers, safe to delete |
| Complete coordinator migration | **MEDIUM** | Test each coordinator thoroughly, migrate incrementally |
| Split event handlers | **MEDIUM** | Event setup is straightforward, test manually |
| Move logic to WASM | **HIGH** | Requires Rust changes, extensive testing, performance validation |

**Recommended Approach:**
1. Start with low-risk removals (Phase 1)
2. Migrate coordinators one at a time (Phase 2)
3. Add tests as you migrate
4. Only move to WASM after JavaScript architecture is clean

---

## 9. Testing Strategy

### For Each Coordinator Migration:

1. **Unit Tests:**
   - Test coordinator methods in isolation
   - Mock Editor dependencies
   - Verify correct WASM calls

2. **Integration Tests:**
   - Test delegate stubs call coordinator correctly
   - Test coordinator interacts with WASM correctly
   - Test UI updates correctly

3. **E2E Tests:**
   - Test user workflows still work
   - Test keyboard shortcuts
   - Test mouse interactions
   - Test clipboard operations

### Critical Test Cases:

- [ ] Cursor movement (arrow keys, home/end, page up/down)
- [ ] Text insertion and deletion
- [ ] Selection (mouse drag, shift+arrow, Ctrl+A)
- [ ] Copy/paste (Ctrl+C/V, middle-click)
- [ ] Undo/redo
- [ ] Inspector tab updates
- [ ] Error handling
- [ ] Document save/load

---

## 10. Conclusion

**Current State:** Transitional architecture with duplicate implementations creates confusion and maintenance burden.

**Goal State:** Clean coordinator-based architecture with clear separation of concerns.

**Recommended Path:**
1. ✅ Remove dead code (immediate, safe)
2. ✅ Complete coordinator migration (medium effort, medium risk)
3. ✅ Simplify event handlers (low effort, medium risk)
4. ⚠️ Move logic to WASM (high effort, high risk - defer until architecture is clean)

**Estimated Effort:**
- Phase 1 (dead code): 2 hours
- Phase 2 (coordinators): 2-3 days
- Phase 3 (new coordinators): 1 day
- Phase 4 (event handlers): 1 day
- Phase 5 (WASM migration): 1-2 weeks

**Total:** ~2-3 weeks of focused refactoring work

**Success Metrics:**
- ✅ Zero duplicate method definitions
- ✅ All coordinator methods have implementations in coordinators
- ✅ Editor.js < 1500 lines
- ✅ All E2E tests passing
- ✅ No dead code remaining
- ✅ Clear architecture documentation

---

## Appendix: Quick Reference

### Methods by Status

**Delegates Exist (29 methods):**
- Cursor: getCursorPosition, getCursorPos, setCursorPosition, validateCursorPosition, updateCursorFromWASM, showCursor, hideCursor, updateCursorVisualPosition, updateCursorPositionDisplay
- Selection: clearSelection, hasSelection, getSelection, getSelectedText, updateSelectionDisplay, updatePrimarySelection
- Clipboard: handleCopy, handleCut, handlePaste, handleMiddleClick
- Render: render, renderAndUpdate, charPosToCellIndex, cellIndexToCharPos, charPosToPixel, cellColToPixel
- Inspector: updateDocumentDisplay, forceUpdateAllExports
- Console: showError, showWarning, addToConsoleLog

**No Delegates (Needs Migration - 40+ methods):**
- Cursor helpers: getCursorElement, createCursorElement, startCursorBlinking, stopCursorBlinking, scrollCursorIntoView, getCurrentStave, getCurrentLine
- Selection helpers: renderSelectionVisual, clearSelectionVisual, getVisuallySelectedCells, getEffectiveSelection, validateSelectionForCommands, replaceSelectedText, deleteSelection, handleSelectAll
- Render helpers: ensureHitboxesAreSet, updateHitboxesDisplay, scheduleStaffNotationUpdate, scheduleHitboxesUpdate, calculateMaxCharPosition, getMaxCellIndex, getMaxCharPosition
- Inspector helpers: updateIRDisplay, updateMusicXMLDisplay, updateLilyPondDisplay, exportMusicXML, renderStaffNotation, toYAML, createDisplayDocument, formatHTML
- Console helpers: addToConsoleErrors, addToConsoleWarnings, createConsoleEntry, removePlaceholder, limitConsoleHistory, recordError, analyzeErrorPatterns
- Core: getDocument, initialize, createNewDocument, loadDocument, saveDocument, insertText, deleteRange, handleBackspace, handleDelete, handleEnter, handleKeyboardEvent, etc.

**Should Stay in Editor (Core Methods - 20+ methods):**
- Document lifecycle: initialize, createNewDocument, loadDocument, saveDocument, getDocument
- Text editing: insertText, deleteRange, handleBackspace, handleDelete, handleEnter, recalculateBeats
- Event routing: setupEventHandlers, handleKeyboardEvent, handleMouseDown/Move/Up, handleDoubleClick
- Undo/redo: handleUndo, handleRedo
- Musical context: getPitchSystemName, getCurrentPitchSystem

**Dead Code (Remove - 5 methods):**
- loadNotationFont (unused)
- updateHTMLDisplay (deprecated)
- updateDocumentFromDirtyLines (stub)
- showUserNotification (disabled)
- Empty WASM sync blocks (4 locations)

---

**Generated:** 2025-11-18 by Claude Code Agent
**File Analyzed:** `/home/john/editor/src/js/editor.js` (2983 lines)
