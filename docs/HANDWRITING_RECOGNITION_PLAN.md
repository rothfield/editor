# Handwritten Sargam Recognition System - Implementation Plan

## Executive Summary

This plan outlines a complete pipeline for recognizing handwritten sargam notation and converting it to the editor's IR (Intermediate Representation) format. The approach uses the **app's built-in handwriting fonts** and renderer to generate synthetic training data with **automatic label generation** - since the renderer already knows character positions, we get bounding boxes for free. No manual labeling needed.

## Phase 1: Synthetic Data Generation

### 1.1 App-Based Synthetic Generation (Recommended Approach)

**Key Insight:** The editor app already has 5 handwriting-style notation fonts with correct PUA glyph rendering. Instead of building a separate Python renderer, we use the app itself as the training data factory.

**Advantages over external font approach:**
- Fonts already render all sargam glyphs correctly (octave dots, accidentals, superscripts)
- Renderer already computes character positions (bboxes are free)
- No duplication of glyph composition logic
- Guaranteed consistency between training data and production rendering

**Implementation Steps:**

1. **Expose Bbox Data from Renderer** (`src/api/render.rs`)

   Add a WASM function that returns glyph positions during rendering:
   ```rust
   #[wasm_bindgen]
   pub fn render_with_labels(text: &str, font_id: u8) -> String {
       let (positions, _) = render_line_with_positions(text, font_id);
       serde_json::to_string(&positions).unwrap()
   }

   struct GlyphPosition {
       char: char,
       bbox: (f32, f32, f32, f32),  // x, y, width, height
       beat_index: usize,
       char_type: String,  // "pitch", "dash", "barline", etc.
       metadata: GlyphMetadata,  // octave_dots, accidental, superscript
   }
   ```

2. **Playwright Screenshot Automation** (`scripts/synth-data/generate-screenshots.js`)
   ```javascript
   const { chromium } = require('playwright');
   const fs = require('fs');

   async function generateTrainingData(sequences, outputDir) {
       const browser = await chromium.launch();
       const page = await browser.newPage();
       await page.goto('http://localhost:8080');

       const fonts = ['hand1', 'hand2', 'hand3', 'hand4', 'hand5'];

       for (const seq of sequences) {
           for (const font of fonts) {
               // Set font and text
               await page.evaluate(({ s, f }) => {
                   window.editor.setFont(f);
                   window.editor.setText(s);
               }, { s: seq.text, f: font });

               // Get bboxes from renderer
               const labels = await page.evaluate(() => {
                   return window.wasmBridge.render_with_labels(
                       window.editor.getText(),
                       window.editor.getFontId()
                   );
               });

               // Screenshot notation area
               const element = await page.$('[data-testid="notation-display"]');
               const id = `${seq.id}_${font}`;
               await element.screenshot({ path: `${outputDir}/images/${id}.png` });

               // Save labels
               fs.writeFileSync(
                   `${outputDir}/labels/${id}.json`,
                   JSON.stringify({ ...JSON.parse(labels), ground_truth_text: seq.text })
               );
           }
       }

       await browser.close();
   }
   ```

3. **Sequence Generator** (`scripts/synth-data/generate-sequences.js`)

   Generate grammatically valid sequences per `src/parse/GRAMMAR.md`:
   ```javascript
   function generateSequences(count) {
       const sequences = [];
       const pitches = ['1','2','3','4','5','6','7'];  // Number system
       const rhythms = ['', '-', '--', '---'];

       for (let i = 0; i < count; i++) {
           // Generate random valid beat patterns
           const beats = [];
           const numBeats = randInt(2, 8);

           for (let b = 0; b < numBeats; b++) {
               let beat = '';
               const subdivisions = randInt(1, 4);
               for (let s = 0; s < subdivisions; s++) {
                   if (Math.random() > 0.3) {
                       beat += randomChoice(pitches);
                       beat += randomChoice(rhythms);
                   } else {
                       beat += '-';
                   }
               }
               beats.push(beat);
           }

           sequences.push({
               id: String(i).padStart(5, '0'),
               text: beats.join(' ')
           });
       }
       return sequences;
   }
   ```

4. **Image Augmentation Pipeline** (`scripts/synth-data/augment.py`)

   Apply handwriting-like distortions to screenshots:
   ```python
   import albumentations as A
   from PIL import Image
   import numpy as np
   from pathlib import Path
   import json

   transform = A.Compose([
       A.Rotate(limit=3, p=0.8),
       A.ElasticTransform(alpha=15, sigma=3, p=0.5),
       A.GaussNoise(var_limit=(10, 30), p=0.5),
       A.GaussianBlur(blur_limit=3, p=0.3),
       A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.5),
   ])

   def augment_dataset(input_dir, output_dir, variants_per_image=5):
       input_path = Path(input_dir)
       output_path = Path(output_dir)

       for png in input_path.glob('images/*.png'):
           img = np.array(Image.open(png))
           labels = json.load(open(input_path / 'labels' / f'{png.stem}.json'))

           for i in range(variants_per_image):
               # Apply augmentation
               augmented = transform(image=img)['image']

               # Save augmented image
               out_id = f'{png.stem}_aug{i}'
               Image.fromarray(augmented).save(output_path / 'images' / f'{out_id}.png')

               # Copy labels (bbox transformation for affine is optional)
               with open(output_path / 'labels' / f'{out_id}.json', 'w') as f:
                   json.dump({**labels, 'augmented_from': png.stem}, f)
   ```

5. **Dataset Structure**
   ```
   data/synthetic/
   ├── images/
   │   ├── 00001_hand1.png
   │   ├── 00001_hand1_aug0.png
   │   ├── 00001_hand1_aug1.png
   │   └── ...
   ├── labels/
   │   ├── 00001_hand1.json
   │   ├── 00001_hand1_aug0.json
   │   └── ...
   └── metadata.json
   ```

**Training Data Volume:**
- 1,000 base sequences × 5 fonts = 5,000 base images
- 5,000 × 5 augmentation variants = 25,000 training images
- Scale as needed (target: 50,000+)

**Deliverables:**
- WASM `render_with_labels()` function exposing bbox data
- Playwright screenshot automation script
- Sequence generator following grammar rules
- Python augmentation pipeline
- **No external font collection needed**
- **No manual labeling required**

### 1.2 Training Image Format: Single Lines

**Approach:** Train on single-line notation images, handle multi-line pages separately.

```
┌─────────────────────────────┐
│ S--r g-P | m-G R--- |       │  ← one training image = one line
└─────────────────────────────┘
```

**Rationale:**
- Simpler model (image → text sequence)
- App renders line-by-line anyway
- Line segmentation is a solved problem (horizontal projection)

**Multi-Line Page Handling (Future):**
```
Full Page Image
      ↓
Line Segmentation (simple CV)
      ↓
Per-Line Recognition (trained model)
      ↓
Combined Output
```

If page-level training is needed later, stack single-line images:
```python
def make_page(line_images, line_height=100):
    page = Image.new('L', (2048, line_height * len(line_images)), 255)
    for i, line_img in enumerate(line_images):
        page.paste(line_img, (0, i * line_height))
    return page
```

---

### 1.3 Real Handwriting Collection (Optional Bootstrap)

**Approach:** Collect small set of real handwriting samples for fine-tuning

**Implementation Steps:**

1. **Web Interface** (`scripts/synth-data/web-collector/`)
   - Simple HTML canvas for drawing
   - Prompt user with target sequence: "Draw: S--r g-P"
   - Capture strokes with timestamps
   - Export as PNG + stroke JSON

2. **Collection Protocol**
   - Recruit 10-20 volunteers
   - Each writes 50-100 sequences
   - Vary writing implements (pen, pencil, marker)
   - Vary paper (lined, blank, grid)

3. **Storage**
   ```
   data/real/
   ├── participant_001/
   │   ├── strokes/
   │   └── images/
   └── ...
   ```

**Deliverables:**
- Web-based collection tool
- 1,000-2,000 real handwriting samples
- Stroke data for temporal analysis

---

## Phase 2: Label Schema & Validation

### 2.1 Label Schema Design (Auto-Generated)

**File Format:** JSON per image with bounding boxes + text labels (generated during rendering)

```json
{
  "image_id": "00001",
  "image_path": "images/00001.png",
  "width": 2048,
  "height": 256,
  "beats": [
    {
      "beat_id": 0,
      "bbox": [10, 30, 210, 190],
      "text": "S--r",
      "elements": [
        {
          "char": "S",
          "bbox": [10, 30, 80, 190],
          "type": "pitch",
          "octave_dots": {"position": "above", "count": 1},
          "accidental": null,
          "superscript": false
        },
        {
          "char": "-",
          "bbox": [85, 100, 130, 120],
          "type": "dash"
        },
        {
          "char": "-",
          "bbox": [135, 100, 180, 120],
          "type": "dash"
        },
        {
          "char": "r",
          "bbox": [185, 50, 210, 180],
          "type": "pitch",
          "octave_dots": null,
          "accidental": null,
          "superscript": false
        }
      ],
      "decorations": {
        "lower_loop": {"left": [10, 200], "right": [210, 200]},
        "slur": null
      }
    }
  ],
  "barlines": [
    {"type": "single", "bbox": [220, 20, 230, 200], "position": 220}
  ],
  "ground_truth_text": "S--r",
  "ground_truth_ir": {
    "measure_divisions": 4,
    "events": [
      {"type": "note", "pitch": "S", "duration_fraction": "3/4"},
      {"type": "note", "pitch": "r", "duration_fraction": "1/4"}
    ]
  }
}
```

### 2.2 Label Validation (Quality Assurance)

**File:** `scripts/validation/validate-labels.py`

#### **Objective**
Validate that auto-generated labels are accurate and consistent.

#### **Validation Checks**

1. **Bounding Box Sanity**
   ```python
   def validate_bboxes(labels):
       for beat in labels["beats"]:
           for elem in beat["elements"]:
               bbox = elem["bbox"]
               assert 0 <= bbox[0] < bbox[2] <= labels["width"]
               assert 0 <= bbox[1] < bbox[3] <= labels["height"]
               assert bbox[2] - bbox[0] > 0  # Non-zero width
               assert bbox[3] - bbox[1] > 0  # Non-zero height
   ```

2. **Character-Bbox Correspondence**
   - Every rendered character has exactly one bbox
   - No missing or duplicate bboxes
   - Left-to-right ordering matches sequence order

3. **Beat Boundary Consistency**
   - Space characters create beat boundaries
   - No overlapping beat bboxes
   - Beats cover all characters

4. **Metadata Accuracy**
   - Octave dots match rendered dots
   - Accidentals match character specification
   - Superscript flags match vertical position

5. **Reconstruction Test**
   ```python
   def test_reconstruction(labels):
       reconstructed = ""
       for i, beat in enumerate(labels["beats"]):
           if i > 0:
               reconstructed += " "
           for elem in beat["elements"]:
               reconstructed += elem["char"]

       assert reconstructed == labels["ground_truth_text"]
   ```

#### **Visual Spot-Check**

Sample 100 random images for human review:
- Render image with bbox overlays
- Verify characters are correctly labeled
- Check octave dots are in correct position
- Ensure spacing looks natural

**Script:** `scripts/validation/visualize-labels.py`
```python
def visualize_sample(image_path, labels_path):
    img = Image.open(image_path)
    draw = ImageDraw.Draw(img)

    for beat in labels["beats"]:
        for elem in beat["elements"]:
            bbox = elem["bbox"]
            draw.rectangle(bbox, outline="red", width=2)
            draw.text((bbox[0], bbox[3]+5), elem["char"], fill="blue")

    img.show()
```

### 2.3 Manual Labeling (Only for Real Handwriting)

**When needed:** Only if collecting real handwriting samples in Phase 1.2

**Tool:** Custom web annotation tool (`scripts/labeling/web-annotator/`)
- Features:
  - Image upload
  - Bounding box drawing
  - Character class dropdown (S, r, R, ...)
  - Octave dot selector (above/below, 1-2)
  - Accidental selector (#, b, etc.)
  - Superscript checkbox
  - Export JSON matching schema

**Not required for MVP** - synthetic data is auto-labeled.

**Deliverables:**
- Label validation scripts
- Visual inspection tool
- Quality metrics dashboard
- 100 spot-checked samples verified

---

## Phase 3: Ingestion Pipeline (Labels → IR)

### 3.1 Architecture Overview

```
Labeled JSON → Character Sequence → Text Buffer → Parser → IR
```

### 3.2 Implementation Steps

#### **Step 1: Spatial Layout to Character Sequence**

**File:** `src/ingest/layout_to_text.rs`

```rust
pub fn labels_to_text_buffer(labels: &LabelData) -> Result<SimpleBuffer, IngestError> {
    // 1. Sort all elements left-to-right by bbox.x
    let mut elements = collect_all_elements(labels);
    elements.sort_by_key(|e| e.bbox.x);

    // 2. Detect beat boundaries (whitespace clustering)
    let beats = group_into_beats(&elements);

    // 3. Construct text line with spaces between beats
    let mut text = String::new();
    for (i, beat) in beats.iter().enumerate() {
        if i > 0 {
            text.push(' '); // Beat separator
        }
        text.push_str(&beat_to_text(beat)?);
    }

    // 4. Create SimpleBuffer with single line
    let mut buffer = SimpleBuffer::new();
    buffer.insert_line(0, text);

    Ok(buffer)
}

fn beat_to_text(beat: &BeatElements) -> Result<String, IngestError> {
    let mut text = String::new();

    for elem in &beat.elements {
        match elem.elem_type {
            ElementType::Pitch => {
                // Convert to codepoint or ASCII
                let ch = pitch_to_char(
                    elem.char,
                    elem.accidental,
                    elem.octave_dots,
                    elem.superscript
                )?;
                text.push(ch);
            },
            ElementType::Dash => {
                text.push('-');
            },
            ElementType::BreathMark => {
                text.push('\'');
            },
            _ => {}
        }
    }

    Ok(text)
}

fn pitch_to_char(
    base: char,
    accidental: Option<Accidental>,
    octave: Option<OctaveDots>,
    is_super: bool
) -> Result<char, IngestError> {
    // Use lookup table from src/renderers/font_utils.rs
    // or convert to PUA codepoint directly

    let pitch_code = char_to_pitch_code(base)?;
    let acc_idx = accidental_to_index(accidental);
    let oct_idx = octave_to_index(octave);

    let base_codepoint = if is_super {
        SARGAM_SUPERSCRIPT_BASE // 0xFAF00
    } else {
        SARGAM_BASE // 0xE300
    };

    let char_idx = pitch_code_to_char_index(pitch_code);
    let codepoint = base_codepoint
        + (char_idx * CHARS_PER_VARIANT)
        + (acc_idx * 5)
        + oct_idx;

    char::from_u32(codepoint).ok_or(IngestError::InvalidCodepoint)
}
```

#### **Step 2: Text Buffer → Cell Model**

**File:** Existing `src/models/core.rs` (reuse)

```rust
// This already exists - just call it
let cells = build_cell_grid(&buffer)?;
```

#### **Step 3: Cell Model → IR**

**File:** Existing `src/ir/builder.rs` (reuse)

```rust
// This already exists - just call it
let export_lines = build_ir_from_cells(&cells, &config)?;
```

### 3.3 Beat Boundary Detection

**Challenge:** How to detect beat boundaries from spatial layout?

**Approach: Clustering Algorithm**

```rust
fn group_into_beats(elements: &[Element]) -> Vec<BeatElements> {
    let mut beats = Vec::new();
    let mut current_beat = Vec::new();

    for i in 0..elements.len() {
        current_beat.push(elements[i].clone());

        // Check if next element starts a new beat
        if i + 1 < elements.len() {
            let gap = elements[i+1].bbox.x - elements[i].bbox.right();
            let avg_char_width = (elements[i].bbox.width() + elements[i+1].bbox.width()) / 2;

            // Heuristic: gap > 1.5x average char width = new beat
            if gap > avg_char_width as f32 * 1.5 {
                beats.push(BeatElements { elements: current_beat });
                current_beat = Vec::new();
            }
        }
    }

    if !current_beat.is_empty() {
        beats.push(BeatElements { elements: current_beat });
    }

    beats
}
```

**Alternative:** Use barlines as explicit measure boundaries, then subdivide into beats.

### 3.4 Validation & Error Handling

**File:** `src/ingest/validate.rs`

```rust
pub fn validate_ingestion(
    labels: &LabelData,
    text: &str,
    ir: &Vec<ExportLine>
) -> ValidationReport {
    let mut report = ValidationReport::new();

    // Check 1: Character count matches
    let label_char_count = labels.count_characters();
    let text_char_count = text.chars().count();
    if label_char_count != text_char_count {
        report.add_warning(format!(
            "Character count mismatch: labels={}, text={}",
            label_char_count, text_char_count
        ));
    }

    // Check 2: Beat count matches
    let label_beats = labels.beats.len();
    let text_beats = text.split_whitespace().count();
    if label_beats != text_beats {
        report.add_error(format!(
            "Beat count mismatch: labels={}, text={}",
            label_beats, text_beats
        ));
    }

    // Check 3: IR events generated
    if ir.is_empty() || ir[0].measures.is_empty() {
        report.add_error("No IR events generated".to_string());
    }

    // Check 4: Duration conservation
    let total_divisions: usize = ir[0].measures.iter()
        .map(|m| m.events.iter().map(|e| e.duration_divisions()).sum::<usize>())
        .sum();
    let expected_divisions = label_beats * 4; // Assuming 4/4 meter
    if total_divisions != expected_divisions {
        report.add_warning(format!(
            "Duration mismatch: actual={}, expected={}",
            total_divisions, expected_divisions
        ));
    }

    report
}
```

### 3.5 End-to-End Ingestion Script

**File:** `scripts/ingest/ingest-handwriting.rs`

```rust
use editor::ingest::{labels_to_text_buffer, validate_ingestion};
use editor::ir::builder::build_ir;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let labels_path = PathBuf::from("data/labels/00001.json");
    let labels: LabelData = serde_json::from_reader(
        std::fs::File::open(&labels_path)?
    )?;

    // Step 1: Labels → Text
    let buffer = labels_to_text_buffer(&labels)?;
    let text = buffer.get_line(0).unwrap();
    println!("Reconstructed text: {}", text);

    // Step 2: Text → Cells
    let cells = build_cell_grid(&buffer)?;
    println!("Generated {} cells", cells.len());

    // Step 3: Cells → IR
    let config = ExportConfig::default();
    let ir = build_ir(&cells, &config)?;
    println!("Generated {} measures", ir[0].measures.len());

    // Step 4: Validate
    let report = validate_ingestion(&labels, &text, &ir);
    println!("{}", report);

    // Step 5: Export IR as JSON
    let ir_json = serde_json::to_string_pretty(&ir)?;
    std::fs::write("output/00001_ir.json", ir_json)?;

    Ok(())
}
```

**Deliverables:**
- Layout-to-text conversion module
- Beat boundary detection algorithm
- Validation suite
- End-to-end ingestion script
- Test suite with 100 synthetic samples

---

## Phase 4: Model Training (Future Work)

### 4.1 Model Architecture Options

**Option A: Two-Stage Pipeline**
1. **Object Detection** (YOLOv8, Faster R-CNN)
   - Input: Image
   - Output: Character bboxes + class probabilities
2. **Sequence Modeling** (LSTM, Transformer)
   - Input: Sorted character sequence
   - Output: Text with spatial layout

**Option B: End-to-End OCR** (TrOCR, PARSeq)
- Input: Image
- Output: Text sequence directly
- Post-processing for beat boundaries

**Option C: Hybrid**
- Segmentation network → Character bboxes
- Per-character CNN classifier → Character class
- Spatial reasoning → Beat grouping

### 4.2 Training Data Split

- Training: 40,000 synthetic + 800 real (80%)
- Validation: 5,000 synthetic + 100 real (10%)
- Test: 5,000 synthetic + 100 real (10%)

### 4.3 Evaluation Metrics

- **Character-level accuracy**: Exact match per character
- **Sequence-level accuracy**: Exact match per beat/measure
- **IR-level accuracy**: Correct IR events (pitch + duration)
- **Edit distance**: Levenshtein distance to ground truth

**Deliverables:** (Future phase - not in initial scope)

---

## Phase 5: Integration with Editor

### 5.1 Workflow

```
User uploads handwritten image
  ↓
Model predicts labels (bbox + classes)
  ↓
Ingestion pipeline: labels → text → IR
  ↓
Editor loads IR into document
  ↓
User reviews/corrects in editor UI
  ↓
Export to MusicXML/LilyPond
```

### 5.2 UI Components

**File:** `src/js/ImportDialog.ts`

```typescript
class HandwritingImportDialog {
  async importImage(file: File): Promise<void> {
    // 1. Upload to server or run local WASM model
    const labels = await recognizeHandwriting(file);

    // 2. Call ingestion pipeline (WASM)
    const ir = await this.wasmBridge.ingest_handwriting_labels(
      JSON.stringify(labels)
    );

    // 3. Load IR into editor
    await this.editor.loadFromIR(ir);

    // 4. Show review UI
    this.showReviewDialog();
  }
}
```

**File:** `src/api/ingest.rs`

```rust
#[wasm_bindgen]
pub fn ingest_handwriting_labels(labels_json: &str) -> Result<String, JsValue> {
    let labels: LabelData = serde_json::from_str(labels_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let buffer = labels_to_text_buffer(&labels)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let cells = build_cell_grid(&buffer)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let config = ExportConfig::default();
    let ir = build_ir(&cells, &config)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let ir_json = serde_json::to_string(&ir)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    Ok(ir_json)
}
```

**Deliverables:**
- Import dialog UI component
- WASM ingestion API
- Review/correction UI
- E2E test with sample handwritten image

---

## Critical Files to Create/Modify

### New Files
```
scripts/synth-data/
  ├── generate-screenshots.js      # Playwright automation
  ├── generate-sequences.js        # Grammar-based sequence generator
  └── augment.py                   # Image augmentation (albumentations)

scripts/validation/
  ├── validate-labels.py           # Sanity checks
  └── visualize-labels.py          # Visual inspection

scripts/labeling/
  └── web-annotator/ (optional - only for real handwriting)

src/ingest/
  ├── mod.rs
  ├── layout_to_text.rs
  ├── beat_detection.rs
  └── validate.rs

docs/
  └── HANDWRITING_RECOGNITION_ARCHITECTURE.md
```

### Modified Files
```
src/api/
  ├── render.rs (new render_with_labels WASM function)
  └── ingest.rs (new ingest_handwriting_labels WASM function)

src/js/
  └── ImportDialog.ts (new UI component)

Cargo.toml (add serde_json dependency if missing)
```

---

## Open Questions & Design Decisions

### Q0: Why Auto-Label Instead of Manual Labeling?

**Key Insight:** Since we're **generating** the synthetic images ourselves, we already know:
- What character was rendered
- Where it was drawn (bounding box)
- All metadata (octave dots, accidentals, superscript flag)

**Advantages of auto-labeling:**
- **Zero labeling cost** - no manual annotation needed
- **Perfect accuracy** - labels are ground truth by construction
- **Instant scalability** - generate 50,000 labeled samples in hours, not weeks
- **Eliminates annotator bias** - no inter-annotator agreement issues
- **Label consistency** - all labels follow exact schema

**When manual labeling is needed:**
- Only for real handwriting samples (Phase 1.2 - optional)
- Validation/spot-checking synthetic quality (100 samples)

### Q1: ASCII vs. PUA Codepoints for Text Representation?

**Option A: ASCII where possible**
- `S r R - ' |` for common cases
- Pros: Human-readable, debuggable
- Cons: Can't represent octave dots, accidentals directly

**Option B: PUA codepoints exclusively**
- `\u{E300} \u{E319} \u{E750}` everywhere
- Pros: Complete semantic encoding, no ambiguity
- Cons: Not human-readable

**Recommendation:** Use **ASCII for base ingestion**, then convert to PUA during cell building. Existing parser already handles this.

### Q2: How to Handle Slurs/Lower Loops in Labels?

**Option A: Ignore during ingestion, let user add in editor**
- Simpler labeling
- Decorations auto-computed from beat boundaries

**Option B: Label explicitly, preserve in IR**
- More complete recognition
- Requires decoration detection in model

**Recommendation:** **Option A for MVP**. Decorations are mostly auto-derived from beat structure, so they're not critical for initial ingestion.

### Q3: Should Barlines Be Part of Text or Separate Metadata?

Current system: Barlines are characters in text buffer (`|`, `||`, etc.)

**Recommendation:** Keep barlines as text characters. Parser already handles them.

### Q4: How to Handle Measure Numbers, Lyrics, Titles?

These are not part of the core rhythm/pitch alphabet.

**Recommendation:** **Phase 2 feature**. Start with pure notation, add metadata later.

---

## Success Criteria

### Phase 1: Synthetic Data Generation
- [ ] `render_with_labels()` WASM function implemented
- [ ] Playwright screenshot automation working
- [ ] 25,000+ synthetic images generated (1000 sequences × 5 fonts × 5 augmentations)
- [ ] All notation systems represented (Number 1-7, Sargam, Western)
- [ ] Octave variants (1-2 dots above/below) included
- [ ] Accidentals (sharp, flat) included
- [ ] Grace notes (superscripts) included
- [ ] Valid rhythm patterns per grammar
- [ ] Augmentation applied (rotation, elastic deform, noise, blur)
- [ ] Ground truth JSON labels with bboxes from renderer

### Phase 2: Label Validation
- [ ] Label validation scripts implemented
- [ ] All auto-generated labels pass sanity checks
- [ ] 100 random samples visually spot-checked
- [ ] Reconstruction test passes (label → text matches ground truth)
- [ ] Bbox accuracy confirmed on visual inspection (overlay test)

### Phase 3: Ingestion Pipeline
- [ ] Label JSON → Text conversion implemented
- [ ] Beat boundary detection working (>90% accuracy on synthetic)
- [ ] Text → Cell → IR pipeline functional (reuse existing)
- [ ] Validation suite catches common errors
- [ ] End-to-end test: labeled image → IR → LilyPond output
- [ ] 100 test cases pass validation

### Phase 4: Integration (Future)
- [ ] Model training pipeline documented
- [ ] Evaluation metrics defined
- [ ] Baseline accuracy measured on test set

### Phase 5: Editor Integration (Future)
- [ ] Import dialog UI implemented
- [ ] WASM ingestion API exposed
- [ ] User can upload image → see IR in editor
- [ ] E2E Playwright test: upload → render

---

## Dependencies & Prerequisites

### Software
- Node.js 18+ (for Playwright screenshot automation)
- Playwright (npm install playwright)
- Python 3.9+ (for augmentation pipeline)
- albumentations, Pillow, NumPy (pip install albumentations pillow numpy)
- Rust 1.75+ (for ingestion pipeline)
- Existing editor codebase (parsers, IR builder, 5 handwriting fonts)

### Data
- App's 5 built-in handwriting fonts (already available)
- Grammar rules from `src/parse/GRAMMAR.md`
- No external fonts required

### Skills
- JavaScript/Playwright (screenshot automation)
- Python scripting (augmentation)
- Rust development (ingestion pipeline)
- Model training (future: PyTorch/TensorFlow)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| App fonts don't look handwritten enough | Apply aggressive augmentation (elastic deform, stroke jitter); collect real samples for validation |
| Renderer bbox extraction incomplete | Validate against visual inspection; add missing metadata fields incrementally |
| Beat boundary detection unreliable | Use barlines as anchors; manual correction UI in editor |
| Augmentation breaks label accuracy | For affine transforms, update bboxes; for elastic, accept approximate labels |
| Model accuracy too low | Increase training data; try different architectures; collect real samples for fine-tuning |
| Integration breaks existing parser | Comprehensive test suite; validate on 1,000 existing docs |

---

## Next Steps

1. **Implement `render_with_labels()` WASM function** in `src/api/render.rs`
   - Expose glyph positions from existing renderer
   - Return JSON with bboxes and metadata

2. **Create Playwright screenshot script** (`scripts/synth-data/generate-screenshots.js`)
   - Automate rendering with all 5 fonts
   - Capture notation area screenshots + labels

3. **Build sequence generator** following grammar rules
   - Start with 100 test sequences to validate approach
   - Cover all pitch/rhythm combinations

4. **Test augmentation pipeline**
   - Apply albumentations to screenshots
   - Visually verify results look handwritten

5. **Scale to 25,000+ images** after validation passes

6. **Implement ingestion pipeline** to test end-to-end flow
