# Key Signature Implementation Analysis - Current State

## Summary
The codebase has **basic key signature support** but with **no dedicated UI component** for selection. It uses simple string-based prompts for input, and the functionality is minimal.

---

## Current Implementation

### 1. Data Model (Rust/WASM)

**Document Level** (`src/models/core.rs`):
- Field: `pub key_signature: Option<String>` (Line 384)
- Default: `None` (empty/unset)
- Type: Optional string (e.g., "C major", "G major", "D minor")

**Line Level** (`src/models/core.rs`):
- Field: `pub key_signature: String` (Line 256)
- Default: `String::new()` (empty)
- Type: String (can override document-level key signature)

### 2. HTML/UI Elements

**File: `index.html`**

**Document-level menu item (Line 471):**
```html
<li><button id="menu-set-key-signature" class="menu-item">Set Key Signature...</button></li>
```
Location: File Menu

**Line-level menu item (Line 500):**
```html
<li><button id="menu-set-key-signature" class="menu-item">Set Key Signature...</button></li>
```
Location: Line Menu

**Note:** Both use the SAME element ID (`menu-set-key-signature`), which is handled by separate action handlers in JavaScript.

### 3. JavaScript Handler (UI Logic)

**File: `src/js/ui.js`**

**Document-level handler** (Lines 978-991):
```javascript
async setKeySignature() {
  const currentSignature = this.getKeySignature();
  const newSignature = prompt('Enter key signature (e.g., C, G, D major, etc.):', currentSignature);

  if (newSignature !== null && newSignature.trim() !== '') {
    this.updateKeySignatureDisplay(newSignature);

    if (this.editor && this.editor.theDocument) {
      this.editor.theDocument.key_signature = newSignature;
      this.editor.addToConsoleLog(`Document key signature set to: ${newSignature}`);
      await this.editor.renderAndUpdate();
    }
  }
}
```

**Line-level handler** (Lines 1187-1201):
```javascript
async setLineKeySignature() {
  const currentSignature = this.getLineKeySignature();
  const newSignature = prompt('Enter line key signature:', currentSignature);

  if (newSignature !== null && newSignature.trim() !== '') {
    this.updateLineKeySignatureDisplay(newSignature);

    if (this.editor && this.editor.theDocument && this.editor.theDocument.lines.length > 0) {
      const lineIdx = this.getCurrentLineIndex();
      this.editor.theDocument.lines[lineIdx].key_signature = newSignature;
      this.editor.addToConsoleLog(`Line key signature set to: ${newSignature}`);
      await this.editor.renderAndUpdate();
    }
  }
}
```

**Getter methods:**
- `getKeySignature()` (Line 1377): Returns document key_signature
- `getLineKeySignature()` (Lines 1422-1428): Returns current line's key_signature
- `updateKeySignatureDisplay()` (Lines 1438-1441): Console log only (stub)
- `updateLineKeySignatureDisplay()` (Lines 1468-1471): Console log only (stub)

### 4. Menu Integration

**File: `src/js/ui.js`**

**Menu setup** (Lines 83-99):
- File menu includes menu item with action `'set-key-signature'`
- Line menu includes menu item with action `'set-line-key-signature'`

**Action dispatcher** (Lines 637-639):
```javascript
case 'set-key-signature':
  this.setKeySignature();
  break;
```

```javascript
case 'set-line-key-signature':
  this.setLineKeySignature();
  break;
```

### 5. WASM/Rust Integration

**File: `src/renderers/musicxml/builder.rs`** (Lines 130-131):
```rust
pub fn set_key_signature(&mut self, key_str: Option<&str>) {
  self.key_signature = key_str.and_then(parse_key_to_fifths);
}
```

**File: `src/renderers/musicxml/emitter.rs`** (Lines 16, 26-28):
- Accepts `document_key_signature` parameter
- Converts key signature string to MusicXML fifths notation
- Falls back to document level if line level is not set

**File: `src/renderers/musicxml/line_to_ir.rs`** (Lines 1093-1096):
```rust
key_signature: if line.key_signature.is_empty() {
  document.key_signature.clone()
} else {
  Some(line.key_signature.clone())
},
```

**Key parsing function** (`parse_key_to_fifths`):
- Converts natural language strings (e.g., "G major", "D minor") to circle-of-fifths values (-7 to +7)
- Used for MusicXML export

---

## Current Limitations

### 1. **No Dedicated UI Component**
- Uses browser `prompt()` dialog for all input
- No visual selector or dropdown
- No validation of input format
- No helpful suggestions or feedback

### 2. **Minimal Validation**
- Accepts any non-empty string
- No format checking
- No validation against known key signatures
- No error messages for invalid input

### 3. **No Display in UI**
- `updateKeySignatureDisplay()` and `updateLineKeySignatureDisplay()` are stubs
- No status bar or header display of current key signature
- Only console logs show updates
- No visual feedback to user

### 4. **No MusicXML Integration Verification**
- Key signature value is stored but export parsing relies on `parse_key_to_fifths()`
- No error handling if parsing fails
- Unknown behavior with non-standard key signature strings

### 5. **No Inspector Tab Display**
- Document model tab shows key_signature in JSON
- No separate UI display or validation helper

---

## Files Involved

### HTML/Markup:
- `/home/john/editor/index.html` (Lines 471, 500)

### JavaScript:
- `/home/john/editor/src/js/ui.js` (Lines 83-99, 637-639, 978-991, 1187-1201, 1377-1428, 1438-1441, 1468-1471)
- `/home/john/editor/src/js/editor.js` (key signature field access)

### Rust/WASM:
- `/home/john/editor/src/models/core.rs` (Lines 254-256, 384, 310, 412)
- `/home/john/editor/src/renderers/musicxml/builder.rs` (Lines 56, 73, 130-131)
- `/home/john/editor/src/renderers/musicxml/emitter.rs` (Lines 16, 26-28, 177-220, 302-311)
- `/home/john/editor/src/renderers/musicxml/line_to_ir.rs` (Lines 1093-1096)

### Related Parser/Converter:
- `/home/john/editor/src/renderers/musicxml/converter.rs` (key signature handling)
- `/home/john/editor/src/converters/musicxml/musicxml_to_lilypond/converter.rs` (key signature in LilyPond conversion)
- `/home/john/editor/src/converters/musicxml/musicxml_to_lilypond/templates.rs` (key signature context)

---

## Data Flow

```
User selects "Set Key Signature" from File/Line menu
         ↓
JavaScript prompts user for input via browser dialog
         ↓
User enters string (e.g., "G major")
         ↓
JavaScript stores in:
  - editor.theDocument.key_signature (document level), OR
  - editor.theDocument.lines[idx].key_signature (line level)
         ↓
Render & Update called
         ↓
WASM processes for MusicXML export:
  - parse_key_to_fifths() converts "G major" → 1 (one sharp)
  - Emitter uses this value in <key> element
         ↓
MusicXML output includes <key><fifths>1</fifths></key>
         ↓
LilyPond converter may use key_signature metadata for \key directive
```

---

## Potential Improvements

### Short Term (Quick Wins):
1. Add input validation in JavaScript
2. Implement `updateKeySignatureDisplay()` to show in UI
3. Add known key signatures dropdown selector
4. Add error handling for invalid keys

### Medium Term:
1. Create dedicated key signature selector component
2. Support for minor keys, modal keys, theoretical keys
3. Key signature transposition helpers
4. Visual display in inspector

### Long Term:
1. Automatic key detection from pitch content
2. Key signature change mid-line support
3. Integration with pitch spelling helpers
4. Visual key signature rendering in score

