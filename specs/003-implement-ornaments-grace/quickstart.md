# Quickstart: Implementing Ornaments

**Target Audience**: Developers implementing ornament feature
**Time to Implement**: 2-3 weeks (depends on team size)
**Complexity**: Moderate (UI, CSS, WASM integration)

---

## Quick Overview

**What you're building**: A dialog-based UI for adding grace notes (ornaments) to musical notation.

**Key components**:
1. **Rust/WASM**: Parsing, validation, position calculation, export
2. **JavaScript**: Dialog UI, event handling, DOM rendering
3. **CSS**: Styling, positioning, font handling

**Workflow**:
- User opens Edit menu → Selects "Ornament"
- Dialog appears with input field
- User types ornament pitches (e.g., "Sa", "R#G")
- Real-time preview shows how it will look
- User selects before/after placement
- User clicks OK → Ornament added to composition
- Ornament renders as small grace note above/below main note

---

## Phase 1: Data Model

### 1.1 Define Ornament struct in Rust

**File**: `src/models/ornament.rs` (NEW)

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ornament {
    pub id: String,
    pub pitches: Vec<OrnamentPitch>,
    pub placement: OrnamentPlacement,
    pub target_cell_index: usize,
    pub position: OrnamentPosition,
    pub bounding_box: BoundingBox,
    pub display_symbol: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrnamentPlacement {
    Before = 0,
    After = 1,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrnamentPitch {
    pub pitch_name: String,
    pub accidental: Accidental,
    pub octave: i8,
    pub symbol: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Accidental {
    None,
    Sharp,
    Flat,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct OrnamentPosition {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BoundingBox {
    pub left: f32,
    pub top: f32,
    pub width: f32,
    pub height: f32,
}
```

### 1.2 Add ornaments to LineElement

**File**: `src/models/line_element.rs` (MODIFY)

```rust
use crate::models::ornament::OrnamentSequence;

pub struct LineElement {
    pub cells: Vec<Cell>,
    pub ornaments: OrnamentSequence,  // NEW
    // ... other fields
}
```

### 1.3 Create OrnamentSequence for storage

**File**: `src/models/ornament.rs` (extend)

```rust
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrnamentSequence {
    pub ornaments: HashMap<String, Ornament>,
    pub order: Vec<String>,
}

impl OrnamentSequence {
    pub fn new() -> Self {
        Self {
            ornaments: HashMap::new(),
            order: Vec::new(),
        }
    }

    pub fn add(&mut self, ornament: Ornament) -> Result<String, String> {
        let id = ornament.id.clone();
        self.ornaments.insert(id.clone(), ornament);
        self.order.push(id.clone());
        Ok(id)
    }

    pub fn get_for_cell(&self, cell_index: usize) -> Vec<&Ornament> {
        self.ornaments.values()
            .filter(|o| o.target_cell_index == cell_index)
            .collect()
    }
}
```

---

## Phase 2: WASM API

### 2.1 Implement OrnamentParser

**File**: `src/parse/ornament.rs` (NEW)

```rust
use crate::models::ornament::*;
use crate::models::pitch_code::PitchCode;

pub struct OrnamentParser;

impl OrnamentParser {
    /// Parse ornament text like "Sa", "R#G", "1b2"
    pub fn parse(
        text: &str,
        notation: &str,
    ) -> Result<Vec<OrnamentPitch>, String> {
        let mut pitches = Vec::new();
        let mut chars = text.chars().peekable();

        while let Some(ch) = chars.next() {
            // Parse pitch name (S, R, G, 1, 2, c, d, etc.)
            let pitch_name = ch.to_string();

            // Validate pitch for notation
            if !is_valid_pitch(&pitch_name, notation) {
                return Err(format!("Invalid pitch: {} in {}", pitch_name, notation));
            }

            // Check for accidental
            let accidental = if let Some(&next) = chars.peek() {
                match next {
                    '#' => {
                        chars.next();
                        Accidental::Sharp
                    },
                    'b' => {
                        chars.next();
                        Accidental::Flat
                    },
                    _ => Accidental::None,
                }
            } else {
                Accidental::None
            };

            let symbol = format_symbol(&pitch_name, accidental);
            pitches.push(OrnamentPitch {
                pitch_name: pitch_name.clone(),
                accidental,
                octave: 0,  // Default, user can adjust in dialog
                symbol,
            });
        }

        if pitches.is_empty() {
            return Err("Ornament must have at least one pitch".to_string());
        }

        Ok(pitches)
    }
}

fn is_valid_pitch(pitch: &str, notation: &str) -> bool {
    match notation {
        "sargam" => matches!(pitch, "S" | "R" | "G" | "M" | "P" | "D" | "N"),
        "number" => matches!(pitch, "1" | "2" | "3" | "4" | "5" | "6" | "7"),
        "abc" => matches!(pitch, "c" | "d" | "e" | "f" | "g" | "a" | "b"),
        _ => false,
    }
}

fn format_symbol(pitch: &str, accidental: Accidental) -> String {
    match accidental {
        Accidental::None => pitch.to_string(),
        Accidental::Sharp => format!("{}#", pitch),
        Accidental::Flat => format!("{}b", pitch),
    }
}
```

### 2.2 Implement position calculation

**File**: `src/html_layout/ornament.rs` (NEW)

```rust
use crate::models::ornament::*;

pub fn calculate_position(
    base_x: f32,
    base_y: f32,
    font_size: f32,
    placement: OrnamentPlacement,
    pitch_count: usize,
) -> OrnamentPosition {
    let ornament_size = font_size * 0.75;

    let y = match placement {
        OrnamentPlacement::Before => base_y - (ornament_size * pitch_count as f32),
        OrnamentPlacement::After => base_y + (font_size * 0.1),
    };

    OrnamentPosition {
        x: (base_x * 10.0).round() / 10.0,  // 0.1px precision
        y: (y * 10.0).round() / 10.0,
        width: ornament_size,
        height: ornament_size * pitch_count as f32,
    }
}

pub fn calculate_bbox(
    position: &OrnamentPosition,
    max_pitch_width: f32,
) -> BoundingBox {
    BoundingBox {
        left: position.x,
        top: position.y,
        width: max_pitch_width + 2.0,
        height: position.height,
    }
}
```

### 2.3 Export WASM functions

**File**: `src/api.rs` (MODIFY/extend)

```rust
use wasm_bindgen::prelude::*;
use crate::models::ornament::*;
use crate::parse::ornament::OrnamentParser;
use crate::html_layout::ornament as ornament_layout;

#[wasm_bindgen]
pub fn parse_ornament(
    text: &str,
    notation: &str,
) -> Result<JsValue, JsValue> {
    let pitches = OrnamentParser::parse(text, notation)
        .map_err(|e| JsValue::from_str(&e))?;

    Ok(serde_wasm_bindgen::to_value(&pitches)?)
}

#[wasm_bindgen]
pub fn calculate_ornament_layout(
    base_x: f32,
    base_y: f32,
    font_size: f32,
    placement: u8,  // 0=before, 1=after
    pitch_count: usize,
) -> Result<JsValue, JsValue> {
    let placement = match placement {
        0 => OrnamentPlacement::Before,
        1 => OrnamentPlacement::After,
        _ => return Err(JsValue::from_str("Invalid placement")),
    };

    let position = ornament_layout::calculate_position(
        base_x, base_y, font_size, placement, pitch_count
    );

    Ok(serde_wasm_bindgen::to_value(&position)?)
}
```

---

## Phase 3: Dialog UI (JavaScript)

### 3.1 Create ornament editor component

**File**: `src/js/ornament-editor.js` (NEW)

```javascript
export class OrnamentEditor {
    constructor(wasmModule) {
        this.wasm = wasmModule;
        this.dialog = null;
        this.currentOrnament = null;
        this.placement = 'before';
    }

    open(targetCellIndex, baseX, baseY, basePitch) {
        // Create dialog HTML
        this.dialog = this.createDialog();
        this.dialog.querySelector('.ornament-input').focus();

        // Store context
        this.targetCellIndex = targetCellIndex;
        this.baseX = baseX;
        this.baseY = baseY;
        this.basePitch = basePitch;

        // Show dialog
        document.body.appendChild(this.dialog);
        this.setupEventListeners();
    }

    createDialog() {
        const div = document.createElement('div');
        div.className = 'ornament-editor-dialog';
        div.innerHTML = `
            <div class="ornament-editor-content">
                <h3>Add Ornament</h3>
                <input type="text" class="ornament-input" placeholder="Enter pitches (e.g., Sa, R#G)">
                <div class="ornament-placement">
                    <label>
                        <input type="radio" name="placement" value="before" checked>
                        Before note
                    </label>
                    <label>
                        <input type="radio" name="placement" value="after">
                        After note
                    </label>
                </div>
                <div class="ornament-preview"></div>
                <div class="ornament-buttons">
                    <button class="ok-btn">OK</button>
                    <button class="cancel-btn">Cancel</button>
                </div>
            </div>
        `;
        return div;
    }

    setupEventListeners() {
        const input = this.dialog.querySelector('.ornament-input');
        const okBtn = this.dialog.querySelector('.ok-btn');
        const cancelBtn = this.dialog.querySelector('.cancel-btn');
        const placement = this.dialog.querySelectorAll('input[name="placement"]');

        input.addEventListener('keydown', (e) => this.onKeyDown(e));
        input.addEventListener('input', (e) => this.updatePreview(e.target.value));

        placement.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.placement = e.target.value;
                this.updatePreview(input.value);
            });
        });

        okBtn.addEventListener('click', () => this.save());
        cancelBtn.addEventListener('click', () => this.close());
    }

    updatePreview(text) {
        if (!text) {
            this.dialog.querySelector('.ornament-preview').innerHTML = '';
            return;
        }

        try {
            // Calculate layout in WASM
            const layout = this.wasm.calculate_ornament_layout(
                this.baseX,
                this.baseY,
                32,  // BASE_FONT_SIZE
                this.placement === 'before' ? 0 : 1,
                text.length  // Approximate pitch count
            );

            // Render preview
            const preview = this.dialog.querySelector('.ornament-preview');
            preview.innerHTML = `<span style="
                position: relative;
                left: ${layout.x}px;
                top: ${layout.y}px;
                font-size: ${layout.width}px;
                font-family: 'Bravura', serif;
            ">${text}</span>`;
        } catch (error) {
            this.dialog.querySelector('.ornament-preview').textContent = error.message;
        }
    }

    onKeyDown(event) {
        if (event.key === 'Enter') {
            this.save();
        } else if (event.key === 'Escape') {
            this.close();
        }
    }

    save() {
        const text = this.dialog.querySelector('.ornament-input').value;
        if (!text) return;

        // Parse in WASM
        try {
            const pitches = this.wasm.parse_ornament(text, 'sargam');

            // Create ornament object
            const ornament = {
                id: `orn-${Date.now()}`,
                pitches,
                placement: this.placement,
                targetCellIndex: this.targetCellIndex,
                displaySymbol: text,
            };

            // Add to document (fire event)
            document.dispatchEvent(new CustomEvent('ornament-created', {
                detail: ornament
            }));

            this.close();
        } catch (error) {
            alert(`Error: ${error.message}`);
        }
    }

    close() {
        if (this.dialog) {
            this.dialog.remove();
            this.dialog = null;
        }
    }
}
```

### 3.2 Add menu handler

**File**: `src/js/editor.js` (MODIFY)

```javascript
import { OrnamentEditor } from './ornament-editor.js';

class Editor {
    constructor() {
        this.ornamentEditor = new OrnamentEditor(this.wasmModule);
        this.setupMenu();
    }

    setupMenu() {
        const editMenu = document.getElementById('menu-edit');
        const ornamentItem = document.createElement('li');
        ornamentItem.textContent = 'Ornament...';
        ornamentItem.addEventListener('click', () => this.openOrnamentEditor());
        editMenu.appendChild(ornamentItem);
    }

    openOrnamentEditor() {
        const cellIndex = this.getCursorCellIndex();
        const cell = this.getCell(cellIndex);

        if (!cell) {
            alert('Please position cursor on a note first');
            return;
        }

        this.ornamentEditor.open(cellIndex, cell.x, cell.y, cell.pitch_code);
    }
}

// Listen for ornament creation
document.addEventListener('ornament-created', (event) => {
    const ornament = event.detail;
    const editor = window.editor;  // Assume global reference

    // Add to document model
    editor.addOrnament(ornament);

    // Re-render
    editor.render();
});
```

---

## Phase 4: Rendering

### 4.1 Create ornament renderer

**File**: `src/js/ornament-renderer.js` (NEW)

```javascript
export class OrnamentRenderer {
    renderOrnament(position, symbol) {
        const span = document.createElement('span');
        span.className = 'ornament-symbol';
        span.style.cssText = `
            position: absolute;
            left: ${position.x.toFixed(1)}px;
            top: ${position.y.toFixed(1)}px;
            font-size: ${position.width.toFixed(1)}px;
            font-family: 'Bravura', serif;
            z-index: 10;
        `;
        span.textContent = symbol;
        return span;
    }
}
```

### 4.2 Integrate into rendering pipeline

**File**: `src/js/renderer.js` (MODIFY)

```javascript
import { OrnamentRenderer } from './ornament-renderer.js';

function renderFromDisplayList(displayList) {
    // ... existing code ...

    // NEW: Render ornaments
    const ornamentRenderer = new OrnamentRenderer();
    for (const ornament of displayList.ornaments || []) {
        const element = ornamentRenderer.renderOrnament(
            ornament.position,
            ornament.displaySymbol
        );
        lineElement.appendChild(element);
    }
}
```

### 4.3 Add CSS

**File**: `src/css/ornament.css` (NEW)

```css
.ornament-symbol {
    position: absolute;
    font-family: 'Bravura', serif;
    z-index: 10;
    white-space: nowrap;
    pointer-events: none;
}

.ornament-symbol.accidental-sharp::after,
.ornament-symbol.accidental-flat::after {
    position: absolute;
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    font-family: 'Bravura', serif;
    line-height: 1;
}

.ornament-symbol.accidental-sharp::after {
    content: '\uE262';
}

.ornament-symbol.accidental-flat::after {
    content: '\uE260';
}

.ornament-editor-dialog {
    position: fixed;
    bottom: 50px;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 15px;
    min-width: 300px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 1000;
}

.ornament-editor-content h3 {
    margin-top: 0;
}

.ornament-input {
    width: 100%;
    padding: 8px;
    font-size: 14px;
    border: 1px solid #ddd;
    border-radius: 3px;
    margin-bottom: 10px;
}

.ornament-preview {
    min-height: 40px;
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 10px;
    margin-bottom: 10px;
    font-size: 24px;
}

.ornament-buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

.ornament-buttons button {
    padding: 8px 16px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: white;
    cursor: pointer;
}

.ornament-buttons .ok-btn {
    background: #007bff;
    color: white;
    border-color: #0056b3;
}
```

---

## Phase 5: Export (Lilypond & MusicXML)

### 5.1 Lilypond export

**File**: `src/renderers/lilypond/ornament.rs` (NEW)

```rust
use crate::models::ornament::*;

pub fn export_lilypond(
    ornament: &Ornament,
    before: bool,
) -> String {
    let pitch_symbols: Vec<String> = ornament.pitches
        .iter()
        .map(|p| pitch_to_lilypond(&p.pitch_name, p.accidental, p.octave))
        .collect();

    let pitches_str = pitch_symbols.join(" ");

    if before {
        format!(r#"\grace {{ {} }}"#, pitches_str)
    } else {
        format!(r#"\afterGrace {{ {} }}"#, pitches_str)
    }
}

fn pitch_to_lilypond(pitch: &str, accidental: Accidental, octave: i8) -> String {
    let pitch_str = match pitch {
        "S" => "c",
        "R" => "d",
        "G" => "e",
        "M" => "f",
        "P" => "g",
        "D" => "a",
        "N" => "b",
        _ => "c",
    };

    let accidental_str = match accidental {
        Accidental::Sharp => "is",
        Accidental::Flat => "es",
        Accidental::None => "",
    };

    let octave_str = "'".repeat((octave + 1).max(0) as usize);

    format!("{}{}{}", pitch_str, accidental_str, octave_str)
}
```

### 5.2 MusicXML export

**File**: `src/renderers/musicxml/ornament.rs` (NEW)

```rust
pub fn export_musicxml(
    ornament: &Ornament,
) -> String {
    let steal_attr = match ornament.placement {
        OrnamentPlacement::Before => "steal-time-following=\"50\"",
        OrnamentPlacement::After => "steal-time-previous=\"50\"",
    };

    let mut pitches_xml = String::new();
    for pitch in &ornament.pitches {
        let alter = match pitch.accidental {
            Accidental::Sharp => "1",
            Accidental::Flat => "-1",
            Accidental::None => "0",
        };

        pitches_xml.push_str(&format!(
            r#"<note><grace slash="no" {}/><pitch><step>{}</step><alter>{}</alter><octave>{}</octave></pitch><type>eighth</type></note>"#,
            steal_attr,
            pitch.pitch_name,
            alter,
            pitch.octave,
        ));
    }

    pitches_xml
}
```

---

## Testing Checklist

- [ ] Parse valid ornament text
- [ ] Parse with accidentals (#, b)
- [ ] Error on invalid pitches
- [ ] Calculate positions before/after
- [ ] Render preview in dialog
- [ ] Update preview on keystroke
- [ ] Save ornament to document
- [ ] Render ornament in staff
- [ ] Ornament doesn't affect horizontal spacing
- [ ] Export to Lilypond
- [ ] Export to MusicXML
- [ ] Roundtrip: Lilypond → MusicXML → Editor
- [ ] E2E: Full user workflow

---

## Key Files Summary

| File | Type | Purpose |
|------|------|---------|
| `src/models/ornament.rs` | Rust | Data structures |
| `src/parse/ornament.rs` | Rust | Parsing & validation |
| `src/html_layout/ornament.rs` | Rust | Position calculation |
| `src/renderers/lilypond/ornament.rs` | Rust | Lilypond export |
| `src/renderers/musicxml/ornament.rs` | Rust | MusicXML export |
| `src/js/ornament-editor.js` | JS | Dialog UI |
| `src/js/ornament-renderer.js` | JS | DOM rendering |
| `src/css/ornament.css` | CSS | Styling |

---

## Development Timeline

**Week 1**: Data model + WASM parsing
**Week 2**: Dialog UI + Real-time preview
**Week 3**: Rendering + Export + Testing

---

**Reference**: See [data-model.md](data-model.md) and [contracts/ornament-api.md](contracts/ornament-api.md) for detailed specifications.
