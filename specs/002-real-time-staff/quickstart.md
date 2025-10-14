# Quickstart Guide: Staff Notation Rendering

## Overview

This guide helps developers understand and implement the real-time staff notation rendering feature. It covers the architecture, key components, implementation sequence, and testing strategy.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Editor Tab  │  │ Other Tabs   │  │ Staff Notation   │   │
│  │  (Canvas)   │  │  (Console,   │  │  Tab (OSMD SVG)  │   │
│  └─────────────┘  │   Data, etc) │  └──────────────────┘   │
│                    └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                             ↕
┌─────────────────────────────────────────────────────────────┐
│                    JavaScript Host Layer                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  editor.js (MusicNotationEditor)                     │   │
│  │  - Document state management                         │   │
│  │  - Keyboard/mouse event handling                     │   │
│  │  - Tab switching logic                               │   │
│  │  - exportMusicXML() → calls WASM                     │   │
│  │  - renderStaffNotation() → calls OSMD renderer      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  osmd-renderer.js (OSMDRenderer)                     │   │
│  │  - Wraps OSMD library                                │   │
│  │  - IndexedDB caching layer                           │   │
│  │  - Error handling & recovery                         │   │
│  │  - Performance monitoring                            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             ↕
┌─────────────────────────────────────────────────────────────┐
│                      WASM Module (Rust)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  api.rs: exportMusicXML(document) -> String         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  renderers/musicxml/                                 │   │
│  │  ├── mod.rs       - Main export logic               │   │
│  │  ├── builder.rs   - MusicXML document builder       │   │
│  │  ├── duration.rs  - Duration calculations           │   │
│  │  └── pitch.rs     - Pitch conversions               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             ↕
┌─────────────────────────────────────────────────────────────┐
│                      External Libraries                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  OSMD (OpenSheetMusicDisplay) 1.7.6+                │   │
│  │  - MusicXML parsing                                  │   │
│  │  - VexFlow rendering engine                          │   │
│  │  - SVG generation                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. User types notation
         ↓
2. Document.lines updated (Cell-based model)
         ↓
3. After 100ms debounce (if on staff notation tab)
         ↓
4. editor.exportMusicXML()
    → WASM: to_musicxml(document)
    → Iterate lines, extract beats, calculate durations
    → Build MusicXML document
    → Return XML string
         ↓
5. osmdRenderer.render(musicxml)
    → Hash MusicXML content
    → Check IndexedDB cache
         ↓
    ┌────────┴────────┐
    │                 │
  Cache Hit      Cache Miss
    │                 │
    │                 ↓
    │          OSMD.load(xml)
    │          OSMD.render()
    │          Generate SVG
    │          Store in cache
    │                 │
    └────────┬────────┘
             ↓
6. Display SVG in staff-notation-container
         ↓
7. Return focus to editor canvas
```

## Implementation Sequence

### Phase 1: Port MusicXML Export (Rust)

**Goal**: Create working MusicXML exporter in Rust/WASM

**Steps**:
1. Create `src/renderers/musicxml/` directory
2. **Copy unchanged modules** from archive:
   - `duration.rs` - Duration calculation helpers
   - `pitch.rs` - Pitch conversion helpers
   - `builder.rs` - MusicXML document builder
3. **Rewrite `mod.rs`** with Cell iteration:
   ```rust
   pub fn to_musicxml(document: &Document) -> String {
       let mut builder = MusicXmlBuilder::new();

       for (line_index, line) in document.lines.iter().enumerate() {
           // Extract beats from cells
           let beats = extract_implicit_beats(&line.cells);

           // Calculate measure divisions (LCM of beat subdivisions)
           let divisions = calculate_divisions(&beats);

           // Process each beat → notes/rests
           for beat in beats {
               process_beat(&mut builder, &beat, divisions);
           }

           // Add system break if not first line
           if line_index > 0 {
               builder.add_system_break();
           }
       }

       builder.finalize()
   }
   ```
4. **Adapt pitch conversion** for current Pitch model:
   ```rust
   fn cell_to_musicxml_pitch(cell: &Cell) -> Result<(String, i8, i8), String> {
       let pitch_code = cell.pitch_code.as_ref()
           .ok_or("Missing pitch code")?;

       // Parse current Pitch model
       let pitch = Pitch::parse(pitch_code)?;

       // Convert to MusicXML step/alter/octave
       match pitch.system {
           PitchSystem::Number => number_to_musicxml(&pitch),
           PitchSystem::Western => western_to_musicxml(&pitch),
           _ => Err("Unsupported pitch system".to_string())
       }
   }
   ```

**Validation**:
- Unit test: Empty document → empty measure
- Unit test: "1 2 3" → three quarter notes
- Unit test: "1 - 2" → half note + quarter note
- Unit test: "1 | 2" → two measures

---

### Phase 2: WASM Binding

**Goal**: Expose MusicXML export to JavaScript

**Steps**:
1. Add to `src/api.rs`:
   ```rust
   #[wasm_bindgen(js_name = exportMusicXML)]
   pub fn export_musicxml(document_js: JsValue) -> Result<String, JsValue> {
       wasm_info!("exportMusicXML called");

       let document: Document = serde_wasm_bindgen::from_value(document_js)
           .map_err(|e| JsValue::from_str(&format!("Deserialization error: {}", e)))?;

       let musicxml = crate::renderers::musicxml::to_musicxml(&document);

       wasm_info!("MusicXML generated: {} bytes", musicxml.len());
       Ok(musicxml)
   }
   ```
2. Rebuild WASM: `make build-wasm`
3. Test in browser console:
   ```javascript
   const xml = wasmModule.exportMusicXML(theDocument);
   console.log(xml);  // Should see valid MusicXML
   ```

**Validation**:
- Manual test: Call from console with test document
- Verify XML structure is valid (paste into validator)

---

### Phase 3: JavaScript OSMD Renderer

**Goal**: Create reusable OSMD wrapper with caching

**Steps**:
1. **Copy `src/js/osmd-renderer.js` from archive** (works as-is!)
2. **Or create new file** if archive unavailable:
   ```javascript
   export class OSMDRenderer {
       constructor(containerId, options = {}) {
           this.container = document.getElementById(containerId);
           if (!this.container) {
               throw new Error(`Container #${containerId} not found`);
           }

           this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(
               containerId,
               {
                   backend: options.backend || 'svg',
                   zoom: options.zoom || 0.5,
                   autoBeam: options.autoBeam ?? true,
                   drawTitle: false,
                   drawComposer: false,
                   newSystemFromXML: true
               }
           );

           this.cacheEnabled = options.cacheEnabled ?? true;
           this.initCache();
       }

       async initCache() {
           if (!this.cacheEnabled) return;

           const request = indexedDB.open('osmd-cache', 1);
           request.onupgradeneeded = (e) => {
               const db = e.target.result;
               if (!db.objectStoreNames.contains('renders')) {
                   db.createObjectStore('renders', { keyPath: 'hash' });
               }
           };
           this.cacheDB = await new Promise((resolve, reject) => {
               request.onsuccess = () => resolve(request.result);
               request.onerror = () => reject(request.error);
           });
       }

       hashMusicXml(xml) {
           let hash = 2166136261;
           for (let i = 0; i < xml.length; i++) {
               hash ^= xml.charCodeAt(i);
               hash *= 16777619;
           }
           return hash.toString(36);
       }

       async render(musicXmlString) {
           const startTime = performance.now();
           const hash = this.hashMusicXml(musicXmlString);

           // Check cache
           if (this.cacheEnabled) {
               const cached = await this.getCached(hash);
               if (cached) {
                   this.container.innerHTML = cached.html;
                   return {
                       success: true,
                       cached: true,
                       renderTime: performance.now() - startTime
                   };
               }
           }

           // Render fresh
           try {
               await this.osmd.load(musicXmlString);
               await this.osmd.render();

               const html = this.container.innerHTML;

               // Cache result
               if (this.cacheEnabled) {
                   await this.setCache(hash, html);
               }

               return {
                   success: true,
                   cached: false,
                   renderTime: performance.now() - startTime
               };

           } catch (error) {
               console.error('OSMD render failed:', error);
               return {
                   success: false,
                   cached: false,
                   renderTime: 0,
                   error: error.message
               };
           }
       }

       async getCached(hash) {
           if (!this.cacheDB) return null;
           return new Promise((resolve) => {
               const tx = this.cacheDB.transaction('renders', 'readonly');
               const store = tx.objectStore('renders');
               const request = store.get(hash);
               request.onsuccess = () => resolve(request.result);
               request.onerror = () => resolve(null);
           });
       }

       async setCache(hash, html) {
           if (!this.cacheDB) return;
           const tx = this.cacheDB.transaction('renders', 'readwrite');
           const store = tx.objectStore('renders');
           store.put({ hash, html, timestamp: Date.now() });
       }
   }
   ```

**Validation**:
- Manual test: Create instance, call render() with test MusicXML
- Verify SVG appears in container
- Verify second call is faster (cached)

---

### Phase 4: Editor Integration

**Goal**: Wire up MusicXML export and OSMD rendering to editor

**Steps**:
1. Update `src/js/editor.js`:
   ```javascript
   class MusicNotationEditor {
       async initialize() {
           // ... existing initialization ...

           // Import OSMD renderer
           const { OSMDRenderer } = await import('./osmd-renderer.js');
           this.osmdRenderer = new OSMDRenderer('staff-notation-container');

           console.log('OSMD renderer initialized');
       }

       async exportMusicXML() {
           if (!this.wasmModule || !this.theDocument) {
               return null;
           }

           try {
               const musicxml = this.wasmModule.exportMusicXML(this.theDocument);
               console.log(`MusicXML exported: ${musicxml.length} bytes`);
               return musicxml;
           } catch (error) {
               console.error('MusicXML export failed:', error);
               return null;
           }
       }

       async renderStaffNotation() {
           if (!this.osmdRenderer) return;

           const musicxml = await this.exportMusicXML();
           if (!musicxml) return;

           const result = await this.osmdRenderer.render(musicxml);

           if (result.success) {
               const cacheMsg = result.cached ? 'from cache' : 'fresh render';
               console.log(`Staff rendered in ${result.renderTime.toFixed(2)}ms (${cacheMsg})`);
           } else {
               console.error('Staff rendering failed:', result.error);
           }
       }

       onDocumentChanged() {
           // ... existing rendering ...

           // Debounce staff notation (100ms)
           clearTimeout(this.staffNotationTimer);
           this.staffNotationTimer = setTimeout(() => {
               if (this.currentTab === 'staff-notation') {
                   this.renderStaffNotation();
               }
           }, 100);
       }

       onTabSwitch(tabName) {
           // ... existing tab switching ...

           if (tabName === 'staff-notation') {
               this.renderStaffNotation();

               // Return focus to editor
               setTimeout(() => this.canvas.focus(), 50);
           }
       }
   }
   ```

**Validation**:
- Type "1 2 3", switch to Staff Notation tab → see three quarter notes
- Type more notes → staff updates after 100ms pause
- Switch away and back → rendering preserved

---

### Phase 5: HTML Updates

**Goal**: Add OSMD library and Staff Notation tab to UI

**Steps**:
1. Update `index.html` - Add OSMD library in `<head>`:
   ```html
   <!-- OSMD for staff notation rendering -->
   <script src="https://unpkg.com/opensheetmusicdisplay@1.7.6/build/opensheetmusicdisplay.min.js"></script>
   ```

2. Add tab button in navigation:
   ```html
   <button id="tab-staff-notation" class="tab" data-tab="staff-notation">
       Staff Notation
   </button>
   ```

3. Add tab content area:
   ```html
   <div id="tab-content-staff-notation" data-tab-content="staff-notation"
        class="tab-content hidden flex-1 flex flex-col p-4">
       <h3 class="text-sm font-semibold mb-2 text-gray-700">
           Staff Notation (OSMD/VexFlow)
       </h3>
       <div id="staff-notation-container"
            class="flex-1 bg-white p-4 border-2 border-gray-300 rounded overflow-auto">
           <div class="text-sm text-gray-500">
               Start typing music to see staff notation...
           </div>
       </div>
   </div>
   ```

4. Wire up tab click handler (in existing JavaScript):
   ```javascript
   if (tabName === 'staff-notation' && window.musicEditor) {
       await window.musicEditor.renderStaffNotation();
   }
   ```

**Validation**:
- Click Staff Notation tab → container visible
- Type notation → rendering appears
- Click other tabs → staff notation preserved

---

## Testing Strategy

### Unit Tests (Rust)

Create `src/renderers/musicxml/tests.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_document() {
        let doc = Document { lines: vec![] };
        let xml = to_musicxml(&doc);
        assert!(xml.contains("<measure number=\"1\">"));
        assert!(xml.contains("<rest/>"));
    }

    #[test]
    fn test_simple_melody() {
        let doc = create_test_document("1 2 3");
        let xml = to_musicxml(&doc);
        assert!(xml.contains("<pitch>"));
        assert_eq!(count_notes(&xml), 3);
    }

    #[test]
    fn test_barlines() {
        let doc = create_test_document("1 2 | 3 4");
        let xml = to_musicxml(&doc);
        assert_eq!(count_measures(&xml), 2);
    }
}
```

Run: `cargo test`

### E2E Tests (Playwright Python)

Create `tests/e2e/test_staff_notation_basic.py`:
```python
import pytest
from playwright.async_api import async_playwright

@pytest.mark.asyncio
async def test_staff_notation_basic():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        await page.goto('http://localhost:8080')

        # Type notation
        await page.type('.editor-canvas', '1 2 3')

        # Switch to staff notation tab
        await page.click('#tab-staff-notation')

        # Wait for SVG render
        await page.wait_for_selector('#staff-notation-container svg', timeout=2000)

        # Verify SVG exists
        svg = await page.query_selector('#staff-notation-container svg')
        assert svg is not None

        # Verify three notes rendered
        notes = await page.query_selector_all('#staff-notation-container svg .vf-stavenote')
        assert len(notes) >= 3

        await browser.close()
```

Run: `make test-e2e`

---

## Debugging Tips

### 1. MusicXML Export Issues

**Check WASM logs**:
```javascript
// In browser console
wasmModule.exportMusicXML(theDocument)
// Check Console Log tab for warnings
```

**Validate MusicXML**:
```javascript
const xml = wasmModule.exportMusicXML(theDocument);
console.log(xml);  // Copy to https://www.musicxml.com/tutorial/file-structure/score-header/
```

### 2. OSMD Rendering Issues

**Check OSMD errors**:
```javascript
// In browser console
const xml = await musicEditor.exportMusicXML();
const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay('staff-notation-container');
await osmd.load(xml);  // Any errors will throw here
await osmd.render();
```

**Common issues**:
- Invalid MusicXML structure → Fix export logic
- Missing OSMD library → Check script tag
- Container not found → Verify element ID

### 3. Performance Issues

**Profile rendering**:
```javascript
performance.mark('start');
await musicEditor.renderStaffNotation();
performance.mark('end');
performance.measure('render', 'start', 'end');
console.log(performance.getEntriesByName('render')[0].duration);
```

**Check cache**:
```javascript
const stats = musicEditor.osmdRenderer.getCacheStats();
console.log(stats);  // Hit rate should be high after first render
```

---

## Common Pitfalls

### 1. Forgetting to Rebuild WASM
**Problem**: Changes to Rust code not reflected in browser
**Solution**: Run `make build-wasm` after every Rust change

### 2. Cache Confusion
**Problem**: Old renders showing after code changes
**Solution**: Clear cache: `await musicEditor.osmdRenderer.clearCache()`

### 3. Focus Not Returning to Editor
**Problem**: Tab switching leaves focus on tab button
**Solution**: Add `setTimeout(() => canvas.focus(), 50)` after render

### 4. Division Overflow
**Problem**: Complex beat subdivisions cause integer overflow
**Solution**: Validate `divisions < 960` before building measure

### 5. Unsupported Pitch System
**Problem**: Sargam/Bhatkhande notation exports as empty
**Solution**: Add system check, show warning to user

---

## Performance Optimization Checklist

- ✅ MusicXML export in Rust/WASM (not JavaScript)
- ✅ IndexedDB caching for repeat renders
- ✅ 100ms debouncing after keystroke
- ✅ Hash-based cache invalidation
- ✅ SVG backend for quality
- ✅ Appropriate zoom level (0.5)
- ✅ Preserve last render on error
- ✅ Return focus to editor after render

---

## Next Steps

After completing implementation:

1. **Run full test suite**: `make test-e2e`
2. **Performance profiling**: Measure export + render times
3. **User testing**: Get feedback on UX
4. **Documentation**: Update user-facing docs
5. **Optimization**: Identify bottlenecks, improve
6. **Task generation**: Run `/speckit.tasks` to create implementation task list

---

## Resources

- [MusicXML Specification](https://www.musicxml.com/)
- [OSMD Documentation](https://opensheetmusicdisplay.github.io/)
- [VexFlow Documentation](https://github.com/0xfe/vexflow)
- [Archive Implementation Plan](../../../MUSICXML_VEXFLOW_PORT_PLAN.md)
- [Project Constitution](../.specify/memory/constitution.md)
