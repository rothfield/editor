# Refactor to Single-Character Cell Model

## Summary
Eliminate multi-character glyphs by switching to a model where each cell contains exactly one character. Rename `glyph` field to `char` for clarity. This simplifies cursor positioning (cursor position = cell index) and removes all character-to-cell conversion logic.

## Data Model Changes

### 1. Update Cell struct (src/models/core.rs)

**Change `glyph` to `char` and add `continuation` field:**

```rust
pub struct Cell {
    pub char: String,         // RENAMED from glyph, always single character
    pub kind: ElementKind,
    pub continuation: bool,   // NEW: true if belongs to previous cell
    pub col: usize,
    pub flags: u8,
    // ... rest unchanged
}
```

**Changes:**
- Rename `pub glyph: String` to `pub char: String`
- Add `pub continuation: bool` field after `kind`
- Update `Cell::new()` to accept `char` parameter and initialize `continuation: false`
- Remove `is_head()`, `set_head()` methods (lines 83-95)
- Update `token_length()` method to just return 1 (or remove it entirely)
- The bit `0x01` in flags becomes unused

**Update all references in this file:**
- Line 18: `pub glyph: String` → `pub char: String`
- Constructor and methods that reference `glyph`

### 2. Update parser to create single-char cells (src/parse/grammar.rs)

**Remove combining logic:**
- Delete `try_combine_tokens()` function entirely (lines 209-280)
- Delete `parse_with_before()` function entirely (lines 84-135)
- Update `parse()` function to work with single characters only
- Update all references from `glyph` to `char`

**Add new function to mark continuations:**
```rust
pub fn mark_continuations(cells: &mut Vec<Cell>) {
    for i in 1..cells.len() {
        let prev = &cells[i - 1];
        let curr = &cells[i];

        // Mark as continuation if:
        // - Previous cell is a note and this is # or b (accidental)
        // - Previous cell is Text and this is also a letter (multi-char text like "Chorus")

        if should_continue(prev, curr) {
            cells[i].continuation = true;
            cells[i].kind = prev.kind;  // Inherit parent's kind
        }
    }
}

fn should_continue(prev: &Cell, curr: &Cell) -> bool {
    // Logic to determine if curr continues prev
    // Check if curr.char is accidental and prev is note
    // Or if both are text characters that should group
    match prev.kind {
        ElementKind::PitchedElement => {
            // If previous is a note and current is accidental
            matches!(curr.char.as_str(), "#" | "b")
        }
        ElementKind::Text => {
            // If previous is text and current is letter
            curr.char.chars().next().map(|c| c.is_alphabetic()).unwrap_or(false)
        }
        _ => false
    }
}
```

### 3. Simplify insert_character API (src/api.rs)

```rust
pub fn insert_character(
    cells_js: JsValue,
    c: char,
    position: usize,  // Now always cell index = cursor position
    pitch_system: u8,
) -> Result<JsValue, JsValue> {
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)?;

    // Create single-char cell
    let column = position;
    let new_cell = parse_single(c, pitch_system, column);

    // Insert at position
    cells.insert(position, new_cell);

    // Update column indices
    for i in (position + 1)..cells.len() {
        cells[i].col += 1;
    }

    // Mark continuations (replaces try_combine_tokens)
    mark_continuations(&mut cells);

    // Calculate new cursor position
    let new_cursor_pos = position + 1;

    // Return { cells, newCursorPos }
    let result = js_sys::Object::new();
    let cells_array = serde_wasm_bindgen::to_value(&cells)?;
    js_sys::Reflect::set(&result, &"cells".into(), &cells_array)?;
    js_sys::Reflect::set(&result, &"newCursorPos".into(), &(new_cursor_pos as f64).into())?;

    Ok(result.into())
}
```

### 4. Simplify delete_character API (src/api.rs)

```rust
pub fn delete_character(
    cells_js: JsValue,
    position: usize,
) -> Result<js_sys::Array, JsValue> {
    let mut cells: Vec<Cell> = serde_wasm_bindgen::from_value(cells_js)?;

    if position >= cells.len() {
        return Err("Position out of bounds".into());
    }

    // Remove cell
    cells.remove(position);

    // Update column indices
    for i in position..cells.len() {
        cells[i].col -= 1;
    }

    // Re-mark continuations
    mark_continuations(&mut cells);

    // Serialize and return
    let result = js_sys::Array::new();
    for cell in cells {
        result.push(&serde_wasm_bindgen::to_value(&cell)?);
    }
    Ok(result)
}
```

### 5. Update all Rust files that reference `glyph`

**Files to update:**
- `src/models/core.rs` - All `glyph` references
- `src/api.rs` - All `glyph` references
- `src/parse/grammar.rs` - All `glyph` references
- `src/renderers/layout_engine.rs` - All `glyph` references (lines 99, 205, 214)
- `src/renderers/display_list.rs` - All `glyph` references
- Any other files in `src/` that reference `cell.glyph`

**Find and replace pattern:**
- `cell.glyph` → `cell.char`
- `cells[i].glyph` → `cells[i].char`
- `.glyph` → `.char` (where context is Cell struct)

### 6. Update JavaScript files (src/js/)

**Remove these methods from editor.js:**
- `charPosToCellIndex()` (lines 978-1002)
- `cellIndexToCharPos()` (if exists)

**Simplify insertText method:**
```javascript
async insertText(text) {
    let cells = this.theDocument.lines[0].cells;
    let currentPos = this.cursor.column;  // Now directly cell index

    for (const char of text) {
        const result = this.wasmModule.insertCharacter(
            cells,
            char,
            currentPos,
            pitchSystem
        );

        cells = result.cells;
        currentPos = result.newCursorPos;
    }

    this.theDocument.lines[0].cells = cells;
    this.cursor.column = currentPos;

    await this.recalculateBeats();
    await this.render();
}
```

**Update all JavaScript references:**
- `cell.glyph` → `cell.char` throughout editor.js, renderer.js, text-input-handler.js

### 7. Update layout engine (src/renderers/layout_engine.rs)

**Simplifications:**
- Line 99: `cell.char.chars().count()` always returns 1 - can replace with assertion
- Line 214: Same - add assertion that `char_count == 1`
- `char_positions` array always has exactly 2 elements: [cursor_left, cursor_right]

### 8. Update documentation files

**Files to update:**
- `implementation-plan.md` - Update Cell struct definition
- `specs/001-poc/data-model.md` - Update Cell struct definition
- `specs/001-poc/line-grammar.md` - Update Cell struct definition
- `DATA_HANDLING_VERIFICATION.md` - Update Cell struct definition
- Any other docs that reference `glyph`

### 9. Update tests

**Remove tests for:**
- Multi-character glyph handling
- `try_combine_tokens` function
- Character-to-cell conversion

**Add tests for:**
- `mark_continuations` function
- Single-char insertion at various positions
- Continuation flag correctness
- Test that `cell.char.len()` is always 1

## Migration Strategy

1. **Phase 1:** Add `continuation: bool` field to Cell, rename `glyph` to `char`
2. **Phase 2:** Update all Rust code to use `char` instead of `glyph`
3. **Phase 3:** Implement `mark_continuations`, stop calling `try_combine_tokens`
4. **Phase 4:** Simplify insert/delete APIs
5. **Phase 5:** Update all JavaScript code to use `char` and remove conversion logic
6. **Phase 6:** Remove unused functions and update tests
7. **Phase 7:** Update documentation

## Benefits

- **Clearer naming:** `char` is more accurate than `glyph` for single characters
- **No more cursor position bugs:** position = cell index, always
- **Simpler code:** ~500 lines of conversion/combination logic removed
- **Explicit relationships:** `continuation` flag makes semantic grouping clear
- **Same visual output:** Renderer still groups characters visually
- **Easier debugging:** One-to-one mapping between positions and cells

## Files Changed

**Rust:**
1. `src/models/core.rs` - Rename `glyph` to `char`, add `continuation`, remove `is_head()`
2. `src/parse/grammar.rs` - Remove combining, add `mark_continuations`, update `glyph` refs
3. `src/api.rs` - Simplify APIs, update `glyph` refs
4. `src/renderers/layout_engine.rs` - Update `glyph` refs, add assertions
5. `src/renderers/display_list.rs` - Update `glyph` refs

**JavaScript:**
6. `src/js/editor.js` - Remove conversion functions, update `glyph` to `char`, simplify insertion/deletion
7. `src/js/renderer.js` - Update `glyph` to `char`
8. `src/js/text-input-handler.js` - Update `glyph` to `char`, simplify

**Documentation:**
9. `implementation-plan.md` - Update Cell definition
10. `specs/001-poc/data-model.md` - Update Cell definition
11. Other spec files as needed

**Tests:**
12. Update existing tests, add new tests for single-char model

## Example: "C#" before and after

### Before (multi-char glyph):
```javascript
[
  { glyph: "C#", kind: "PitchedElement", pitch_code: "C#", ... }
]
// cursor position 0 = before C
// cursor position 1 = between C and #
// cursor position 2 = after #
// But cell index 0 = the whole "C#"
// Need charPosToCellIndex() to convert
```

### After (single-char cells):
```javascript
[
  { char: "C", kind: "PitchedElement", continuation: false, pitch_code: "C#", ... },
  { char: "#", kind: "PitchedElement", continuation: true }
]
// cursor position 0 = before C (cell index 0)
// cursor position 1 = between C and # (cell index 1)
// cursor position 2 = after # (cell index 2)
// cursor position = cell index directly, no conversion needed
```

## Example: Insertion "pq←r produces prq"

### Before (current buggy behavior):
```
Initial: [{ glyph: "p" }, { glyph: "q" }]
Insert 'r' at char position 1 (between p and q)
  → Need to convert char pos 1 to cell index
  → Complicated logic, potential bugs
```

### After (simple):
```
Initial: [{ char: "p" }, { char: "q" }]
Insert 'r' at position 1
  → cells.insert(1, { char: "r" })
  → Result: [{ char: "p" }, { char: "r" }, { char: "q" }]
  → cursor at position 2
```
