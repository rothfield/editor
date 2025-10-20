# JavaScript Violations - Detailed Examples

## Critical Issue #1: Cursor State Managed in JavaScript

### Current Implementation (WRONG)
**File:** src/js/editor.js

```javascript
// Line 150-156: State created in JavaScript
document.state = {
  cursor: { stave: 0, column: 0 },
  selection: null
};

// Line 309: Direct mutation during text insertion
this.theDocument.state.cursor.column = currentCharPos;

// Line 626-629: Setting cursor position
setCursorPosition(position) {
  const validatedPosition = this.validateCursorPosition(position);
  this.theDocument.state.cursor.column = validatedPosition;
  this.updateCursorPositionDisplay();
}

// Line 597-602: Cursor state queries in JS
getCurrentStave() {
  if (this.theDocument && this.theDocument.state && this.theDocument.state.cursor) {
    return this.theDocument.state.cursor.stave;
  }
  return 0;
}

// Line 639-658: Cursor validation in JS
validateCursorPosition(position) {
  const maxPosition = this.getMaxCharPosition();
  return Math.max(0, Math.min(position, maxPosition));
}
```

### Why This Is Wrong

1. **State Ownership:** JS shouldn't own the state - WASM should
2. **Validation in JS:** Bounds checking should be WASM responsibility
3. **No Single Source of Truth:** Multiple files query this state
4. **Synchronization Issues:** Hard to keep JS and WASM in sync

### What It Should Be (CORRECT)
**File:** src/rust/editor_core.rs

```rust
pub struct EditorState {
    pub cursor: CursorPosition,
    pub selection: Option<Selection>,
    pub document: Document,
}

impl EditorState {
    pub fn move_cursor_left(&mut self) {
        if self.cursor.column > 0 {
            self.cursor.column -= 1;
        }
    }
    
    pub fn move_cursor_right(&mut self) {
        let max = self.get_max_position();
        if self.cursor.column < max {
            self.cursor.column += 1;
        }
    }
    
    pub fn set_cursor(&mut self, line: usize, column: usize) -> Result<()> {
        self.validate_position(line, column)?;
        self.cursor.stave = line;
        self.cursor.column = column;
        Ok(())
    }
    
    fn validate_position(&self, line: usize, column: usize) -> Result<()> {
        if line >= self.document.lines.len() {
            return Err("Line out of bounds");
        }
        if column > self.get_line_max_position(line) {
            return Err("Column out of bounds");
        }
        Ok(())
    }
}

// JavaScript (clean, read-only):
#[wasm_bindgen]
pub fn move_cursor_left(state: &mut JsValue) {
    // WASM owns and mutates state
}

#[wasm_bindgen]
pub fn get_cursor_position(state: &JsValue) -> JsValue {
    // JS reads state, never mutates
}
```

**JavaScript Usage:**
```javascript
// editor.js - CLEAN (after refactor)
class Editor {
    handleKeyDown(event) {
        if (event.key === 'ArrowLeft') {
            // WASM handles cursor movement
            this.editorState = wasmModule.move_cursor_left(this.editorState);
            this.render();
        }
    }
    
    render() {
        // Read-only access to state
        const cursor = wasmModule.get_cursor_position(this.editorState);
        this.renderer.render(this.editorState);
    }
}
```

---

## Critical Issue #2: State Preservation Antipattern

### Current Implementation (WRONG)
**File:** src/js/ui.js

```javascript
// Lines 522-541: The "preserve state" hack
async setTitle() {
    const currentTitle = this.getDocumentTitle();
    const newTitle = prompt('Enter document title:', currentTitle);

    if (newTitle !== null) {
        this.updateDocumentTitle(newTitle);

        if (this.editor && this.editor.theDocument && this.editor.wasmModule) {
            try {
                // VIOLATION: Save state before WASM call
                const preservedState = this.editor.theDocument.state;
                const preservedBeats = this.editor.theDocument.lines.map(line => line.beats);

                // Call WASM to update title
                const updatedDocument = await this.editor.wasmModule.setTitle(
                    this.editor.theDocument, 
                    newTitle
                );

                // VIOLATION: Restore state after WASM call
                updatedDocument.state = preservedState;
                updatedDocument.lines.forEach((line, index) => {
                    line.beats = preservedBeats[index];
                });

                this.editor.theDocument = updatedDocument;
                // ... render
            } catch (error) {
                console.error('Failed to set title via WASM:', error);
            }
        }
    }
}
```

### Why This Is Wrong

1. **Indicates Design Flaw:** If we need to preserve state, why is WASM touching it?
2. **Fragile:** Breaks if new fields are added to state
3. **Performance:** Unnecessary array copies
4. **Confusion:** WASM API contract unclear
5. **Tight Coupling:** JS and WASM state structures must match

### What It Should Be (CORRECT)

**Rust (WASM):**
```rust
pub struct EditorState {
    pub cursor: CursorPosition,
    pub selection: Option<Selection>,
    pub document: Document,
}

#[wasm_bindgen]
pub fn set_document_title(state: &mut JsValue, title: &str) -> Result<()> {
    let mut state = serde_json::from_value::<EditorState>(state)?;
    state.document.title = title.to_string();
    // State is mutated in place, cursor/selection unchanged
    *state = serde_json::to_value(&state)?;
    Ok(())
}
```

**JavaScript (clean, after refactor):**
```javascript
// ui.js - CLEAN (after refactor)
async setTitle() {
    const currentTitle = this.getDocumentTitle();
    const newTitle = prompt('Enter document title:', currentTitle);

    if (newTitle !== null) {
        try {
            // No need to preserve anything - WASM owns complete state
            await wasmModule.set_document_title(this.editorState, newTitle);
            
            // Re-render (WASM only modified title, nothing else changed)
            this.updateDocumentTitle(newTitle);
            this.render();
        } catch (error) {
            console.error('Failed to set title:', error);
        }
    }
}
```

---

## Critical Issue #3: Direct Document Mutation in UI Class

### Current Implementation (WRONG)
**File:** src/js/ui.js

```javascript
// Line 591: Direct property assignment
async setTonic() {
    const currentTonic = this.getTonic();
    const newTonic = prompt('Enter tonic (C, D, E, F, G, A, B):', currentTonic);

    if (newTonic !== null && newTonic.trim() !== '') {
        this.updateTonicDisplay(newTonic);

        // VIOLATION: UI class mutating document directly
        if (this.editor && this.editor.theDocument) {
            this.editor.theDocument.tonic = newTonic;  // <- DIRECT MUTATION
            this.editor.addToConsoleLog(`Document tonic set to: ${newTonic}`);
            await this.editor.render();
            this.editor.updateDocumentDisplay();
        }
    }
}

// Line 685: Another direct assignment
async setKeySignature() {
    const newSignature = prompt('Enter key signature:', 
                               this.getKeySignature());

    if (newSignature !== null && newSignature.trim() !== '') {
        this.updateKeySignatureDisplay(newSignature);

        // VIOLATION: UI mutating document
        if (this.editor && this.editor.theDocument) {
            this.editor.theDocument.key_signature = newSignature;  // <- DIRECT MUTATION
            this.editor.addToConsoleLog(`Document key signature set to: ${newSignature}`);
            await this.editor.render();
        }
    }
}

// Line 878: Mutating line properties
async setLineKeySignature() {
    const newSignature = prompt('Enter line key signature:', 
                               this.getLineKeySignature());

    if (newSignature !== null && newSignature.trim() !== '') {
        this.updateLineKeySignatureDisplay(newSignature);

        // VIOLATION: UI reaching into document structure
        if (this.editor && this.editor.theDocument && 
            this.editor.theDocument.lines.length > 0) {
            const lineIdx = this.getCurrentLineIndex();
            this.editor.theDocument.lines[lineIdx].key_signature = newSignature;  // <- MUTATION
            this.editor.addToConsoleLog(`Line key signature set to: ${newSignature}`);
            await this.editor.render();
        }
    }
}
```

### Why This Is Wrong

1. **UI Owns Document:** UI should never mutate the model
2. **No Validation:** Direct assignment bypasses any business logic
3. **Inconsistent:** Some operations go through WASM (title), others don't (tonic)
4. **Testing:** Impossible to test UI independently
5. **Type Safety:** No guarantees that assigned values are valid

### What It Should Be (CORRECT)

**Rust (WASM):**
```rust
#[wasm_bindgen]
pub fn set_document_tonic(state: &mut JsValue, tonic: &str) -> Result<()> {
    let mut state = serde_json::from_value::<EditorState>(state)?;
    
    // Validate tonic
    match tonic {
        "C" | "D" | "E" | "F" | "G" | "A" | "B" => {
            state.document.tonic = tonic.to_string();
        }
        _ => return Err("Invalid tonic".into())
    }
    
    *state = serde_json::to_value(&state)?;
    Ok(())
}

#[wasm_bindgen]
pub fn set_line_key_signature(state: &mut JsValue, line_idx: usize, 
                              signature: &str) -> Result<()> {
    let mut state = serde_json::from_value::<EditorState>(state)?;
    
    // Validate line exists
    if line_idx >= state.document.lines.len() {
        return Err("Line index out of bounds".into());
    }
    
    // Validate key signature
    if signature.is_empty() {
        return Err("Key signature cannot be empty".into());
    }
    
    state.document.lines[line_idx].key_signature = signature.to_string();
    
    *state = serde_json::to_value(&state)?;
    Ok(())
}
```

**JavaScript (clean, after refactor):**
```javascript
// ui.js - CLEAN (after refactor)
async setTonic() {
    const currentTonic = this.getTonic();
    const newTonic = prompt('Enter tonic (C, D, E, F, G, A, B):', currentTonic);

    if (newTonic !== null && newTonic.trim() !== '') {
        try {
            // WASM validates and applies the change
            this.editorState = await wasmModule.set_document_tonic(
                this.editorState, 
                newTonic
            );
            
            this.updateTonicDisplay(newTonic);
            this.render();
        } catch (error) {
            alert('Invalid tonic: ' + error);
        }
    }
}

async setLineKeySignature() {
    const lineIdx = this.getCurrentLineIndex();
    const currentSig = this.getLineKeySignature();
    const newSignature = prompt('Enter line key signature:', currentSig);

    if (newSignature !== null && newSignature.trim() !== '') {
        try {
            // WASM validates line index and signature
            this.editorState = await wasmModule.set_line_key_signature(
                this.editorState,
                lineIdx,
                newSignature
            );
            
            this.updateLineKeySignatureDisplay(newSignature);
            this.render();
        } catch (error) {
            alert('Failed to set key signature: ' + error);
        }
    }
}
```

---

## Critical Issue #4: Business Logic in Cursor Validation

### Current Implementation (WRONG)
**File:** src/js/editor.js

```javascript
// Lines 639-658: Cursor validation with bounds checking
validateCursorPosition(position) {
    if (!this.theDocument || !this.theDocument.lines || 
        this.theDocument.lines.length === 0) {
        return 0;
    }

    const maxPosition = this.getMaxCharPosition();

    // VIOLATION: Bounds checking logic in JS
    const clampedPosition = Math.max(0, Math.min(position, maxPosition));

    if (clampedPosition !== position) {
        logger.warn(LOG_CATEGORIES.CURSOR, 'Cursor position clamped', {
            requested: position,
            clamped: clampedPosition,
            maxPosition
        });
    }

    return clampedPosition;
}

// Used when setting cursor position (Line 625-634)
setCursorPosition(position) {
    if (this.theDocument && this.theDocument.state) {
        // VIOLATION: Validation in JS before storing
        const validatedPosition = this.validateCursorPosition(position);
        this.theDocument.state.cursor.column = validatedPosition;
        this.updateCursorPositionDisplay();
        this.updateCursorVisualPosition();
        this.showCursor();
    }
}
```

### Why This Is Wrong

1. **Business Logic in UI:** Cursor bounds checking is document model logic
2. **Multiple Sources of Truth:** Different validation in different places
3. **Hard to Test:** Can't isolate cursor logic
4. **Type Unsafe:** No guarantee validation matches WASM expectations
5. **Performance:** Position validated twice (here and in WASM calls)

### What It Should Be (CORRECT)

**Rust (WASM):**
```rust
impl EditorState {
    /// Validate and set cursor position
    /// Returns error if position is invalid
    pub fn set_cursor_position(&mut self, column: usize) -> Result<()> {
        let max_position = self.get_max_position();
        
        if column > max_position {
            return Err(format!("Position {} exceeds max {}", column, max_position));
        }
        
        self.cursor.column = column;
        Ok(())
    }
    
    /// Get maximum valid cursor position for current line
    fn get_max_position(&self) -> usize {
        if self.cursor.stave >= self.document.lines.len() {
            return 0;
        }
        
        let line = &self.document.lines[self.cursor.stave];
        line.cells.len()
    }
    
    pub fn validate_cursor_position(position: usize, 
                                   document: &Document,
                                   stave: usize) -> Result<usize> {
        if stave >= document.lines.len() {
            return Err("Stave out of bounds".into());
        }
        
        let max = document.lines[stave].cells.len();
        if position > max {
            return Err(format!("Position {} exceeds line max {}", position, max));
        }
        
        Ok(position)
    }
}

#[wasm_bindgen]
pub fn set_cursor_position(state: &mut JsValue, position: usize) -> Result<()> {
    let mut state = serde_json::from_value::<EditorState>(state)?;
    state.set_cursor_position(position)?;
    *state = serde_json::to_value(&state)?;
    Ok(())
}
```

**JavaScript (clean, after refactor):**
```javascript
// editor.js - CLEAN (after refactor)
setCursorPosition(position) {
    try {
        // WASM validates and applies - no local validation needed
        wasmModule.set_cursor_position(this.editorState, position);
        
        // Update visual representation
        this.updateCursorPositionDisplay();
        this.updateCursorVisualPosition();
        this.showCursor();
    } catch (error) {
        console.warn('Invalid cursor position:', error);
        // Position was rejected by WASM, cursor unchanged
    }
}
```

---

## Critical Issue #5: Selection State Managed in JavaScript

### Current Implementation (WRONG)
**File:** src/js/editor.js

```javascript
// Lines ~915-927: Creating selection state in JS
startSelection(type = 'cell') {
    if (!this.theDocument || !this.theDocument.state) {
        return;
    }

    // VIOLATION: Selection state created in JS
    this.theDocument.state.selection = {
        active: true,
        type: type,
        startPos: this.getCursorPosition(),
        startStave: this.getCurrentStave(),
        endPos: this.getCursorPosition(),
        endStave: this.getCurrentStave()
    };
}

// Lines ~920-927: Extending selection
extendSelectionRight() {
    if (!this.theDocument || !this.theDocument.state) {
        return;
    }

    // VIOLATION: Selection logic in JS
    const currentStave = this.theDocument.state.cursor.stave;
    if (!this.theDocument.state.selection) {
        this.startSelection();
    }

    const line = this.getCurrentLine();
    if (line && this.theDocument.state.cursor.column < line.cells.length) {
        this.theDocument.state.cursor.column++;
        this.theDocument.state.selection.endPos = this.theDocument.state.cursor.column;
        this.theDocument.state.selection.endStave = currentStave;
    }

    this.updateSelectionDisplay();
}

// Clearing selection
clearSelection() {
    if (this.theDocument && this.theDocument.state) {
        this.theDocument.state.selection = null;  // <- Direct mutation
    }
}

// Checking if selected
hasSelection() {
    return !!(this.theDocument && this.theDocument.state && 
              this.theDocument.state.selection && 
              this.theDocument.state.selection.active);
}
```

### Why This Is Wrong

1. **Complex State Machine:** Selection logic should be in WASM
2. **Scattered Logic:** Selection queries in renderer, UI, editor
3. **Hard to Debug:** State mutations across multiple files
4. **No Invariants:** Nothing prevents invalid selection states
5. **Rendering Complexity:** Each render must query selection state

### What It Should Be (CORRECT)

**Rust (WASM):**
```rust
#[derive(Serialize, Deserialize)]
pub struct Selection {
    pub start_pos: usize,
    pub start_stave: usize,
    pub end_pos: usize,
    pub end_stave: usize,
}

impl EditorState {
    pub fn start_selection(&mut self) {
        self.selection = Some(Selection {
            start_pos: self.cursor.column,
            start_stave: self.cursor.stave,
            end_pos: self.cursor.column,
            end_stave: self.cursor.stave,
        });
    }
    
    pub fn extend_selection_right(&mut self) -> Result<()> {
        // Ensure we have a selection
        if self.selection.is_none() {
            self.start_selection();
        }
        
        // Get current line max position
        if self.cursor.stave >= self.document.lines.len() {
            return Err("Invalid stave".into());
        }
        
        let line = &self.document.lines[self.cursor.stave];
        let max_pos = line.cells.len();
        
        // Move cursor right if possible
        if self.cursor.column < max_pos {
            self.cursor.column += 1;
        }
        
        // Update selection end position
        if let Some(ref mut sel) = self.selection {
            sel.end_pos = self.cursor.column;
            sel.end_stave = self.cursor.stave;
        }
        
        Ok(())
    }
    
    pub fn extend_selection_left(&mut self) -> Result<()> {
        if self.selection.is_none() {
            self.start_selection();
        }
        
        if self.cursor.column > 0 {
            self.cursor.column -= 1;
        }
        
        if let Some(ref mut sel) = self.selection {
            sel.end_pos = self.cursor.column;
            sel.end_stave = self.cursor.stave;
        }
        
        Ok(())
    }
    
    pub fn clear_selection(&mut self) {
        self.selection = None;
    }
    
    pub fn has_selection(&self) -> bool {
        self.selection.is_some()
    }
    
    pub fn get_selected_range(&self) -> Option<(usize, usize)> {
        self.selection.as_ref().map(|sel| {
            let start = sel.start_pos.min(sel.end_pos);
            let end = sel.start_pos.max(sel.end_pos);
            (start, end)
        })
    }
}
```

**JavaScript (clean, after refactor):**
```javascript
// editor.js - CLEAN (after refactor)
startSelection() {
    try {
        wasmModule.start_selection(this.editorState);
        this.updateSelectionDisplay();
    } catch (error) {
        console.error('Failed to start selection:', error);
    }
}

extendSelectionRight() {
    try {
        wasmModule.extend_selection_right(this.editorState);
        this.updateSelectionDisplay();
        this.render();
    } catch (error) {
        console.error('Failed to extend selection:', error);
    }
}

clearSelection() {
    try {
        wasmModule.clear_selection(this.editorState);
        this.updateSelectionDisplay();
        this.render();
    } catch (error) {
        console.error('Failed to clear selection:', error);
    }
}

// In renderer:
render() {
    const hasSelection = wasmModule.has_selection(this.editorState);
    const selectedRange = hasSelection ? 
        wasmModule.get_selected_range(this.editorState) : null;
    
    this.renderDOM(this.editorState, selectedRange);
}
```

---

## Summary of Violations by Severity

| Severity | Issue | Files | Impact |
|----------|-------|-------|--------|
| CRITICAL | Cursor state in JS | editor.js | All cursor operations broken if changed |
| CRITICAL | Selection state in JS | editor.js | Selection logic impossible to test |
| CRITICAL | State preservation hack | ui.js | Makes WASM API unclear |
| HIGH | Direct document mutation | ui.js | No validation of assignments |
| HIGH | Business logic in validation | editor.js | Duplicate validation logic |
| HIGH | Property setters in UI | ui.js | UI owns business logic |
| MEDIUM | State initialization in JS | document-manager.js | State structure unclear |
| MEDIUM | Text processing in JS | text-input-handler.js | Should be thin wrapper |

**Total Violations:** 50+
**Effort to Fix:** 2-3 weeks
**Priority:** IMMEDIATELY - Blocks all other improvements

