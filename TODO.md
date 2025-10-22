# TODO - Persistent Tasks

## 1. Docker for Playwright/WebKit Testing ✅ COMPLETE

**Problem**: Playwright's WebKit browser fails on Arch Linux due to library incompatibilities (specifically `libffi.so.7: version 'LIBFFI_BASE_7.0' not found`).

**Solution Implemented**: Set up Docker container for cross-browser testing

**Files Created/Modified**:
- ✅ `Dockerfile` - Multi-stage build with Ubuntu 20.04, all Playwright dependencies, pre-installed browsers
- ✅ `docker-compose.yml` - Orchestrates test environment with proper mounts and isolation
- ✅ `.dockerignore` - Optimizes build context
- ✅ `scripts/run-tests-docker.sh` - Helper script for easy test running
- ✅ `DOCKER_TESTING.md` - Complete documentation
- ✅ `playwright.config.js` - WebKit re-enabled (works in Docker)

**Usage**:
```bash
# Run all tests in Docker (Chromium, Firefox, WebKit)
docker-compose run --rm playwright-tests

# Or use helper script
./scripts/run-tests-docker.sh
```

**How It Works**:
1. Multi-stage Docker build optimizes image size
2. Stage 1: Installs dependencies and npm packages
3. Stage 2: Includes all browser dependencies from Ubuntu 20.04
4. Pre-installs all three Playwright browsers (Chromium, Firefox, WebKit)
5. WebKit works reliably in this Ubuntu environment

---

## 2. Fix Accidental Parsing (c#, 1# should combine)

**Problem**: Typing `c#` or `1#` creates two separate cells instead of one combined pitch.

**Root Cause**: `src/js/keyboard-handler.js:148-153` processes characters one-by-one
```javascript
handleCharacterInput(event) {
    const char = event.key;
    if (char.length === 1 && !event.ctrlKey && !event.metaKey) {
        this.editor.insertText(char);  // ← Processes single chars only
    }
}
```

**Current Behavior**:
1. User types `c` → creates cell with `'c'`
2. User types `#` → creates separate cell with `'#'`

**Expected Behavior**:
- `c#` should create single cell: `"c#"` (C sharp)
- `1#` should create single cell: `"1#"` (scale degree 1 sharp)
- Same for `bb`, `##` (double accidentals)

**Parser Already Supports This**:
- `src/parse/pitch_system.rs` has lookup tables for combined tokens:
  - Western: `"c#"`, `"c##"`, `"cb"`, `"cbb"`, etc.
  - Number: `"1#"`, `"1##"`, `"1b"`, `"1bb"`, etc.
  - Sargam: Similar patterns

**Solution**: Implement lookahead in keyboard handler
- Check if next character would form valid multi-char token
- Buffer characters until complete token formed
- Options:
  1. **Simple debounce**: Wait 100-200ms after `c` before creating cell, check if `#` follows
  2. **State machine**: Track "awaiting accidental" state after pitch characters
  3. **Backspace-and-replace**: If user types `#` after a pitch, delete previous cell and replace with combined token

**Files to Modify**:
- `src/js/keyboard-handler.js` - Add lookahead logic
- `src/js/editor.js` - May need `insertCombinedToken()` method
- Tests needed in `tests/e2e-pw/tests/`

**Related**:
- Parser at `src/parse/grammar.rs:31-37` already handles multi-char patterns
- `parse_note()` function supports accidentals

---

## 3. Implement ChatGPT Pitch System Suggestions

**See**: `PITCH_SYSTEM_IMPLEMENTATION.md` for full details

**Summary**: Implement multi-notation support with inheritance pattern

### Key Features to Implement:

#### A. Document-level and Line-level Notation
- Add `document.notation_default: NotationKind`
- Add `line.notation: Option<NotationKind>` (inherits from document if `None`)
- Similar for `tonic` and `mode` (for relative notations)

#### B. Notation Switching (View-Only Transform)
- Don't mutate stored pitches when switching notation
- Re-render using different renderer
- Prompt for tonic/key when switching to relative notation (123, Do-Re-Mi)
- Show preview before switching

#### C. Rust Model Changes
```rust
pub struct Document {
    pub notation_default: Notation,
    pub tonic_default: Option<Tonic>,
    pub mode_default: Option<Mode>,
    pub lines: Vec<Line>,
}

pub struct Line {
    pub notation: Option<Notation>,  // None = inherit from document
    pub tonic: Option<Tonic>,
    pub mode: Option<Mode>,
    pub text: String,
}

impl Line {
    pub fn effective_notation(&self, doc: &Document) -> Notation {
        self.notation.unwrap_or(doc.notation_default)
    }
}
```

#### D. Renderer Strategy
**Option 1**: Pass `RenderContext` with defaults
```rust
pub struct RenderContext {
    pub notation_default: Notation,
    pub tonic_default: Option<Tonic>,
    pub mode_default: Option<Mode>,
}
```

**Option 2**: Pre-resolve to `LineView` (recommended)
```rust
pub struct LineView<'a> {
    pub src: &'a Line,
    pub notation: Notation,  // Already resolved
    pub tonic: Option<Tonic>,
    pub mode: Option<Mode>,
}
```

#### E. UI/UX Changes
- Add notation picker in toolbar/menu
- Show badge on lines with notation override
- "Use document default" / "Set line notation" actions
- Prompt for tonic/key when needed
- Preview mode before applying changes

### Files to Modify:
- `src/models/core.rs` - Add notation fields to Document/Line
- `src/models/pitch_systems/mod.rs` - Notation enum
- `src/renderers/` - Add RenderContext or LineView
- `src/js/ui.js` - Add notation picker UI
- `src/api.rs` - Expose new WASM functions
- Tests throughout

### Policy:
- ✅ Support multiple notations per document
- ✅ Allow per-line notation overrides
- ⚠️ Inline annotations only (not mixing in primary content)
- ❌ Don't mix notations within same beat/line
- 🔄 Notation changes are view-only (don't mutate pitches)

---

## 4. Fix JS/WASM Architectural Boundary Violations

**Problem**: JavaScript is directly mutating the document model instead of calling WASM functions. This creates dual ownership - both JS and WASM think they own the document state.

**Impact**: ~30+ violations across 4 files, making code unpredictable and hard to test.

### Current (Wrong) Pattern
```javascript
// ❌ BAD: JS owns the document mutations
const updatedCells = wasm.insertCharacter(line.cells, char);
line.cells = updatedCells;  // Direct mutation
```

### Correct Pattern
```javascript
// ✅ GOOD: WASM is single source of truth
this.theDocument = wasm.insertCharacter(this.theDocument, lineIdx, char);
// Document is immutable reference, always from WASM
```

### 5 Categories of Violations

#### Category 1: Direct `line.cells` Mutations (CRITICAL)
- `editor.js:291` - insertText() assigns cells
- `editor.js:409` - parseText() assigns cells
- `editor.js:576` - deleteRange() uses Array.splice()
- `editor.js:1438, 1493` - handleBackspace/Delete assign cells
- `editor.js:1792, 1891` - Slur/Octave operations assign cells
- `text-input-handler.js:140, 185, 367, 400, 433` - Multiple mutations

**Fix**: Change WASM to accept full `document`, not just `cells`

#### Category 2: Direct Document Property Mutations (HIGH)
- `ui.js:591, 685` - Direct `document.tonic = ...`, `document.key_signature = ...`
- `ui.js:742, 878` - Direct `line.tonic = ...`, `line.key_signature = ...`

**Fix**: All property changes must call WASM functions

#### Category 3: State/Beats Preservation Hacks (ARCHITECTURAL)
- ~15 locations in `ui.js`, `document-manager.js`, `editor.js`
- Pattern: preserve state/beats → call WASM → restore state/beats

```javascript
// ❌ Workaround for WASM limitations
const preservedState = doc.state;
const preservedBeats = doc.lines.map(l => l.beats);
const updated = wasm.setTitle(doc, title);
updated.state = preservedState;
updated.lines.forEach((l, i) => l.beats = preservedBeats[i]);
```

**Root Cause**: WASM loses these fields during serialization

**Fix**: Either:
- Separate runtime state from document (state never to WASM)
- Fix WASM to preserve all fields during operations

#### Category 4: TextInputHandler Design (CRITICAL)
- Holds document reference and mutates it
- Creates shared mutable state with WASM

**Fix**: Make stateless - only operate on data, don't hold references

#### Category 5: Beat Derivation (MEDIUM)
- `editor.js:353, 360, 373, 381` - JS manages `line.beats`
- Beats should be computed by WASM and included in document

**Fix**: WASM should compute beats and include in returned document

### 5-Phase Refactoring Plan

#### Phase 1: WASM API Changes (1-2 days)
Make WASM functions accept full `document`, return `updatedDocument`:
```rust
// OLD: pub fn insertCharacter(cells: Vec<Cell>, char: char, pos: usize) -> Vec<Cell>
// NEW: pub fn insertCharacter(doc: Document, line_idx: usize, char: char, cell_idx: usize) -> Document
```

Apply to: insertCharacter, deleteCharacter, deleteRange, applyOctave, applySlur, removeSlur, setTonic, setKeySignature, setLineTonic, setLineKeySignature

#### Phase 2: Fix JS Call Sites (1-2 days)
Apply pattern everywhere:
```javascript
// BEFORE: const cells = wasm.op(line.cells); line.cells = cells;
// AFTER: this.theDocument = wasm.op(this.theDocument, lineIdx);
```

Files: editor.js (~10), ui.js (~4), text-input-handler.js (~5)

#### Phase 3: Fix State/Beats Serialization (2-3 days)
**Recommended approach**: Separate runtime state from document

```javascript
// UI state - NEVER goes to WASM
this.uiState = { cursor, selection, has_focus };

// Document state - ONLY from WASM
this.theDocument = wasm.operation(this.theDocument, ...);
```

#### Phase 4: Refactor TextInputHandler (1 day)
- Remove document reference
- Return updated document, don't mutate

#### Phase 5: Documentation (1 day)
- Create `JS_WASM_BOUNDARY.md`
- Add JSDoc to all WASM wrapper functions
- Update architecture diagrams

### Approach Options

**Option 1: Full Refactor (6-9 days)**
- All 5 phases
- Cleanest architecture
- Best for long-term

**Option 2: Critical Only (3-4 days)**
- Phases 1+2 (fix direct mutations)
- Leave state/beats hacks for later
- 80% of benefit with less risk

**Option 3: Incremental (1-2 days per sprint)**
- One category at a time
- Lower risk per sprint
- Longer overall timeline

### Files Requiring Changes
1. `/home/john/editor/src/js/editor.js` - 10+ violations
2. `/home/john/editor/src/js/ui.js` - 4 mutations + 6 hacks
3. `/home/john/editor/src/js/text-input-handler.js` - 5 mutations
4. `/home/john/editor/src/js/document-manager.js` - 5 hacks (if applicable)
5. Rust WASM API changes in `src/api.rs`

### Testing Strategy
- Run Playwright tests after each phase
- Focus on: insert, delete, navigation, property changes
- Check for state/beats preservation

---

## Additional Notes

### Current Pitch Systems Supported:
From `src/parse/pitch_system.rs`:
1. **Number** (1-7 with #/b)
2. **Western** (a-g with #/b)
3. **Sargam** (SrRgGmMPdDnN)
4. Bhatkhande (uses Sargam handler)
5. Tabla (uses Number handler)

### Future Enhancements:
- Export in multiple formats (preserve original or use current view)
- Import detection (auto-set line notation based on content)
- Notation conversion suggestions when ambiguous
- Side-by-side view (two notations at once)

---

## Architecture & Technotes

**See**: `technote_lily_pond_rendering_architecture_proxy_bff_pattern.md`

Recommended architecture for production LilyPond rendering:
- Use Backend-for-Frontend (BFF) proxy pattern
- Direct browser→LilyPond suitable only for prototypes/internal tools
- Includes caching, rate limiting, sandboxing, job management strategies

---

## Priority

1. **High**: Fix JS/WASM boundary violations - affects architecture and testability (6-9 days)
2. **High**: Fix accidental parsing (c#, 1#) - affects current usage (3-5 days)
3. **Medium**: Implement pitch system inheritance - new feature (2-3 weeks)
4. **Low**: Docker for WebKit - workaround available (skip WebKit tests)
