# JavaScript File Categorization Summary

## Quick Reference - File Quality Assessment

### GREEN FILES (UI-Only - No Business Logic)
```
✅ main.js                    - Application initialization and orchestration
✅ keyboard-handler.js        - Keyboard event to command routing  
✅ lilypond-tab.js           - LilyPond source code display
✅ lilypond-png-tab.js       - LilyPond PNG rendering display
✅ lilypond-renderer.js      - LilyPond document compilation
✅ osmd-renderer.js          - OpenSheetMusicDisplay rendering
✅ export-ui.js              - Export dialog UI
✅ menu-system.js            - Menu rendering and interaction
✅ resize-handle.js          - Window resize handling
✅ logger.js                 - Logging infrastructure
✅ constants.js              - Configuration constants
✅ performance-monitor.js    - Performance metrics collection
✅ midi-player.js            - MIDI playback controls
```

**Total Lines:** ~3,500 (26% of codebase)
**Status:** GOOD - Suitable for incremental rendering and UI updates

---

### YELLOW FILES (Mixed - Some Business Logic)
```
⚠️  events.js                - Event routing + some business coupling
⚠️  renderer.js              - DOM rendering + state queries
⚠️  cursor-manager.js        - Cursor state + selection logic
⚠️  autosave.js              - Autosave logic + document state
⚠️  slur-renderer.js         - Slur visualization + state checks
⚠️  lyrics-renderer.js       - Lyrics display + state checks
⚠️  file-ops.js              - File operations + document manipulation
⚠️  lilypond-png-tab.js      - Export logic + state reads
```

**Total Lines:** ~2,500 (19% of codebase)
**Status:** NEEDS REFACTORING - Contains both UI and business logic

---

### RED FILES (Critical - Business Logic in JS)
```
❌ editor.js                 - SEVERE: Core editing logic, state management
❌ ui.js                     - HIGH: Document mutation in UI class
❌ document-manager.js       - MODERATE: State creation and validation
❌ text-input-handler.js     - MODERATE: Text processing and position mapping
```

**Total Lines:** ~2,000 (15% of codebase)
**Status:** CRITICAL - MUST REFACTOR - Move to WASM

---

## File-by-File Breakdown

### RED - TIER 1: CRITICAL VIOLATIONS

#### src/js/editor.js (800 lines)
```
Category: ❌ BUSINESS LOGIC
Issue: Core document model operations mixed with UI

Functions with violations:
├── insertText()              - Updates document.state directly
├── deriveBeats()             - Modifies line.beats array
├── deleteCharacter()         - Full deletion logic (should be WASM)
├── getCurrentStave()         - Cursor state query
├── getCursorPosition()       - State accessor
├── setCursorPosition()       - Direct state mutation
├── validateCursorPosition()  - Business logic (bounds checking)
├── moveCursorUp()            - Navigation logic
├── moveCursorDown()          - Navigation logic
├── extendSelectionLeft()     - Selection state mutation
├── extendSelectionRight()    - Selection state mutation
├── applySlur()               - Musical command with state mutation
├── applyOctave()             - Musical command with state mutation
└── toggleSlur()              - State modifying command

Problem: 50%+ of the file is business logic, not UI
Impact: Tight coupling makes testing impossible
```

#### src/js/ui.js (1,185 lines)
```
Category: ⚠️ MIXED (UI class with business logic)
Issue: UI component directly mutating document properties

Violations:
├── setTitle()                - Calls WASM, preserves state hack
├── setComposer()             - Direct document mutation
├── setTonic()                - Direct property assignment
├── setPitchSystem()          - State preservation pattern
├── setKeySignature()         - Direct assignment
├── setLineLabel()            - WASM call with state preservation
├── setLineLyrics()           - WASM call with state preservation
├── setLineTonic()            - Direct line mutation
├── setLinePitchSystem()      - WASM call with state preservation
├── setLineKeySignature()     - Direct line mutation
├── getCurrentLineIndex()     - Fallback business logic in UI
└── Multiple "preserve" patterns - Indicates architectural debt

Problem: UI class treating itself as state manager
Impact: Cannot test UI independently from document logic
```

#### src/js/document-manager.js (150+ lines)
```
Category: ⚠️ MIXED (State management in JS)
Issue: Document creation and validation should be WASM

Violations:
├── createNew()               - Creates state object in JS
├── load()                    - Validates document in JS
├── validateDocument()        - Document structure validation
└── save()                    - Removes state before serialization

Problem: State round-tripping indicates design issue
Impact: Serialization logic fragile, breaks when state changes
```

#### src/js/text-input-handler.js (200+ lines)
```
Category: ⚠️ MIXED (Text processing logic)
Issue: Document model operations in text handler

Violations:
├── insertText()              - Character-to-cell conversion
├── deleteCharacter()         - Text deletion logic
├── getEffectivePitchSystem() - Complex business logic
├── setCurrentLineIndex()     - Cursor line tracking in JS
└── charPosToCellIndex()      - Position calculation

Problem: Text handler has too much responsibility
Impact: Should be thin wrapper around WASM parser
```

---

### YELLOW - TIER 2: MODERATE VIOLATIONS

#### src/js/events.js (~200 lines)
```
Category: ⚠️ MIXED (Event routing + business dispatch)
Issue: Event handlers call business logic directly

Pattern:
  handleKeyDown() 
    → calls editor.applySlur() 
    → mutates state
  
Problem: No abstraction between input and state change
Impact: Hard to trace state mutations, no command queue
```

#### src/js/renderer.js (~200 lines)
```
Category: ⚠️ MIXED (Rendering + state queries)
Issue: Renderer checks business properties during render

Patterns:
  if (cell.slur) { /* render slur */ }    - State query in render
  if (cell.octave) { /* render dots */ }  - State query in render

Problem: Rendering assumes document structure
Impact: Tight coupling between model and presentation
```

#### src/js/file-ops.js (~200 lines)
```
Category: ⚠️ MIXED (File I/O + document manipulation)
Issue: File operations couple with document state

Functions:
  newFile()    → calls editor.createNewDocument()
  loadFile()   → calls editor.loadDocument()
  
Problem: File ops drive document state, not independent
Impact: Can't save/load without side effects
```

#### src/js/autosave.js (~100 lines)
```
Category: ⚠️ MIXED (Autosave + document state)
Issue: Autosave logic tied to document mutations

Pattern:
  Timer fires → calls editor.saveDocument() → mutates document
  
Problem: State changes happen as side effects
Impact: No control over when state persists
```

---

### GREEN - TIER 3: ACCEPTABLE (UI-Only)

#### src/js/main.js (150 lines)
```
Category: ✅ UI-ONLY (Application initialization)
Responsibilities:
  ├── Component wiring
  ├── Event listener setup
  ├── Application lifecycle
  └── Error handling

Status: GOOD - Clean initialization pattern
```

#### src/js/lilypond-tab.js (100+ lines)
```
Category: ✅ UI-ONLY (Display tab for LilyPond source)
Responsibilities:
  ├── Render source code display
  ├── Format code for readability
  └── Handle tab interactions

Status: GOOD - Pure rendering from document
```

#### src/js/lilypond-png-tab.js (100+ lines)
```
Category: ✅ UI-ONLY (Display tab for rendered notation)
Responsibilities:
  ├── Render compiled LilyPond output
  ├── Image display
  └── Handle tab interactions

Status: GOOD - Pure rendering from external service
```

#### src/js/osmd-renderer.js (300+ lines)
```
Category: ✅ UI-ONLY (OSMD staff notation rendering)
Responsibilities:
  ├── Canvas rendering
  ├── Audio playback
  └── Layout management

Status: GOOD - Isolated rendering component
Note: Has audio player but no document mutation
```

#### src/js/lilypond-renderer.js (150+ lines)
```
Category: ✅ UI-ONLY (LilyPond compilation service)
Responsibilities:
  ├── Compile LilyPond to PNG/SVG
  ├── Manage external service calls
  └── Handle compilation caching

Status: GOOD - External service wrapper
```

#### src/js/export-ui.js (200+ lines)
```
Category: ✅ UI-ONLY (Export dialog)
Responsibilities:
  ├── Export format selection
  ├── File download
  └── Dialog interaction

Status: GOOD - Pure UI component (calls WASM for export)
```

---

## State Mutation Map

### Direct State Mutations in JavaScript (ANTI-PATTERN)

```
editor.js:
  Line 152-156      state = { cursor, selection }
  Line 309          state.cursor.column = X
  Line 626-629      state.cursor.column = X
  Line 900-910      state.cursor.stave = X
  Line 920-927      state.selection = { ... }

ui.js:
  Line 524-533      Preserve/restore state pattern
  Line 591          theDocument.tonic = X
  Line 685          theDocument.key_signature = X
  Line 878          theDocument.lines[i].key_signature = X

document-manager.js:
  Line 52-56        document.state = { ... }
  Line 138          Remove state before save
```

**Total Mutation Points:** 50+
**Pattern:** All should be in WASM

---

## Boundary Issues

### State Serialization Problem
```
Current (BAD):
  document = {
    title: "...",
    lines: [...],
    state: {                      <- Runtime state mixed in
      cursor: { stave, column },
      selection: { ... }
    }
  }
  
  When saving: Remove state object (fragile!)
  When loading: Recreate state object (error-prone!)

Should be:
  WASM Owns: { document, editing_state }
  JS Gets: { document, editing_state } <- READ-ONLY
  JS Renders: DOM from { document, editing_state }
```

### WASM API Boundary Problem
```
Current (BAD):
  setTitle(document, title) → returns modified document
  JS: preserve state → modify document → restore state
  
Should be:
  set_title(state: &mut EditorState, title: str)
  WASM: Owns the state, mutates in place
  JS: Never touches state object
```

---

## Refactoring Impact Map

### If you refactor editor.js
Affects:
- ui.js (document mutations)
- events.js (command dispatch)
- renderer.js (state queries)
- Everything that calls it (50+ functions)

### If you refactor ui.js
Affects:
- editor.js (state preservation)
- file-ops.js (document loading)
- All menu operations

### If you refactor document-manager.js
Affects:
- editor.js (state creation)
- file-ops.js (document loading)
- autosave.js (state persistence)

---

## Migration Path

### Priority 1: Move Cursor/Selection State
Files affected: editor.js, ui.js, renderer.js
Effort: 1 week
Impact: Unblocks all other refactoring

### Priority 2: Move Navigation Operations
Files affected: editor.js, events.js
Effort: 3 days
Impact: Simplifies cursor management

### Priority 3: Move Property Setters
Files affected: ui.js, document-manager.js
Effort: 2 days
Impact: Reduces state mutation points

### Priority 4: Clean Up Rendering
Files affected: renderer.js, events.js
Effort: 1 week
Impact: Pure rendering for better testing

---

## Code Quality Scores

| File | Lines | Business | UI | Infrastructure | Score |
|------|-------|----------|-----|-----------------|-------|
| editor.js | 800 | 60% | 30% | 10% | D |
| ui.js | 1185 | 40% | 50% | 10% | C |
| main.js | 150 | 0% | 90% | 10% | A |
| osmd-renderer.js | 300 | 0% | 95% | 5% | A |
| lilypond-renderer.js | 150 | 0% | 100% | 0% | A |
| events.js | 200 | 30% | 60% | 10% | C |
| renderer.js | 200 | 10% | 80% | 10% | B |
| document-manager.js | 150 | 50% | 30% | 20% | D |
| file-ops.js | 200 | 20% | 60% | 20% | B |
| text-input-handler.js | 200 | 60% | 20% | 20% | D |

**Average Score:** C+ (Below expectations for production code)
**Needs Improvement:** 40% of codebase

