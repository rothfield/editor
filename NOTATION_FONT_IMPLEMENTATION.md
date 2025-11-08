# Notation Font Implementation Guide

## Overview

The `NotationMonoDotted.ttf` font has been generated with support for four notation systems, each with 4 variants (1 dot above, 2 dots above, 1 dot below, 2 dots below).

### Supported Systems

| System | Characters | Count |
|--------|-----------|-------|
| **Number** | `1234567` | 7 |
| **Western** | `CDEFGABcdefgab` | 14 |
| **Sargam** | `SrRgGmMPdDnN` | 12 |
| **Doremi** | `drmfsltDRMFSLT` | 14 |
| **TOTAL** | 47 base characters | **188 glyphs** (47 × 4 variants) |

### Character Order (Critical!)

The characters are mapped in this exact order. This order **must match** between Python (font generation) and your Rust/JS code:

```
1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT
```

Breaking it down:
- **0-6**: `1234567` (Number system)
- **7-20**: `CDEFGABcdefgab` (Western system)
- **21-32**: `SrRgGmMPdDnN` (Sargam system)
- **33-46**: `drmfsltDRMFSLT` (Doremi system, includes 'f' and 'F')

## Font Usage

### 1. CSS Setup

Add this to your stylesheet:

```css
@font-face {
    font-family: 'NotationMonoDotted';
    src: url('/fonts/NotationMonoDotted.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
}

.notation-text {
    font-family: 'NotationMonoDotted', monospace;
    font-size: 16px;
    letter-spacing: 0.1em;
}
```

### 2. Codepoint Mapping

Each base character gets 4 codepoints in the Private Use Area (PUA):

```
Codepoint = 0xE000 + (character_index × 4) + variant_index
```

Where:
- `character_index` = position in the character order (0-46)
- `variant_index`:
  - `0` = 1 dot above
  - `1` = 2 dots above
  - `2` = 1 dot below
  - `3` = 2 dots below

### 3. Example Codepoints

| Character | Index | 1 Dot Above | 2 Dots Above | 1 Dot Below | 2 Dots Below |
|-----------|-------|------------|--------------|------------|--------------|
| `1` | 0 | `0xE000` | `0xE001` | `0xE002` | `0xE003` |
| `C` | 7 | `0xE01C` | `0xE01D` | `0xE01E` | `0xE01F` |
| `d` (doremi) | 33 | `0xE084` | `0xE085` | `0xE086` | `0xE087` |
| `f` (doremi) | 36 | `0xE090` | `0xE091` | `0xE092` | `0xE093` |

### 4. Detailed Mapping

Full mapping is available in `notation_font_mapping.json`:

```json
{
  "base_chars": "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT",
  "pua_start": 57344,
  "systems": {
    "number": "1234567",
    "western": "CDEFGABcdefgab",
    "sargam": "SrRgGmMPdDnN",
    "doremi": "drmfsltDRMFSLT"
  },
  "glyphs": {
    "1": { "above1": "0xe000", "above2": "0xe001", "below1": "0xe002", "below2": "0xe003" },
    "C": { "above1": "0xe01c", "above2": "0xe01d", "below1": "0xe01e", "below2": "0xe01f" },
    // ... complete mapping for all 47 characters
  }
}
```

## Implementation in Rust/WASM

### 1. Character to Index Mapping

```rust
// Define the base character string (MUST match Python)
const ALL_CHARS: &str = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";
const PUA_START: u32 = 0xE000;

// Get the font codepoint for a character with octave shift
fn get_glyph_codepoint(base_char: char, octave_shift: i8) -> char {
    // Find index of character in ALL_CHARS
    let index = match ALL_CHARS.find(base_char) {
        Some(idx) => idx as u32,
        None => return base_char, // Fallback to base if not found
    };

    // Determine variant based on octave shift
    let variant_idx: u32 = match octave_shift {
        1  => 0,  // 1 dot above
        2  => 1,  // 2 dots above
        -1 => 2,  // 1 dot below
        -2 => 3,  // 2 dots below
        0  => return base_char, // No dots
        _  => 0,  // Default to 1 dot above for out-of-range
    };

    // Calculate final codepoint
    let codepoint = PUA_START + (index * 4) + variant_idx;

    // Convert to char
    char::from_u32(codepoint).unwrap_or(base_char)
}

// Usage in rendering code:
let base_char = note.pitch_code_to_char(notation_system);
let glyph_char = get_glyph_codepoint(base_char, note.octave_shift);
html_output.push(glyph_char);
```

### 2. Integration with Document Model

If your document model stores octave shifts:

```rust
pub struct Note {
    pub base_pitch: char,      // e.g., '1', 'C', 'S', 'd'
    pub octave_shift: i8,      // -2..+2 (dots below/above)
    pub notation_system: NotationSystem,
}

impl Note {
    pub fn to_display_char(&self) -> char {
        let base = self.base_pitch;
        get_glyph_codepoint(base, self.octave_shift)
    }
}
```

## Implementation in JavaScript/HTML

### 1. String Building

```javascript
// Character order (MUST match Python and Rust)
const ALL_CHARS = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";
const PUA_START = 0xE000;

function getGlyphCodepoint(baseChar, octaveShift) {
    const index = ALL_CHARS.indexOf(baseChar);
    if (index === -1) return baseChar;

    let variantIdx;
    switch (octaveShift) {
        case 1:  variantIdx = 0; break;  // 1 dot above
        case 2:  variantIdx = 1; break;  // 2 dots above
        case -1: variantIdx = 2; break;  // 1 dot below
        case -2: variantIdx = 3; break;  // 2 dots below
        case 0:  return baseChar;
        default: variantIdx = 0;
    }

    const codepoint = PUA_START + (index * 4) + variantIdx;
    return String.fromCodePoint(codepoint);
}

// Usage in DOM
const glyphChar = getGlyphCodepoint('1', 1);  // '1' with 1 dot above
element.textContent += glyphChar;
```

### 2. HTML with Data Attributes

```html
<div class="notation-text" data-pitch="1" data-shift="1"></div>

<script>
const notation = document.querySelector('.notation-text');
const pitch = notation.dataset.pitch;
const shift = parseInt(notation.dataset.shift);
notation.textContent = getGlyphCodepoint(pitch, shift);
</script>
```

### 3. React Component Example

```javascript
import React from 'react';

const NotationChar = ({ baseChar, octaveShift = 0 }) => {
    const glyphChar = getGlyphCodepoint(baseChar, octaveShift);
    return <span className="notation-text">{glyphChar}</span>;
};

export default NotationChar;

// Usage
<NotationChar baseChar="C" octaveShift={2} />  // C with 2 dots above
<NotationChar baseChar="d" octaveShift={-1} /> // d with 1 dot below
```

## Testing

### 1. Visual Test Page

Create `test-notation-font.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Notation Font Test</title>
    <style>
        @font-face {
            font-family: 'NotationMonoDotted';
            src: url('/fonts/NotationMonoDotted.ttf') format('truetype');
        }

        .notation-text {
            font-family: 'NotationMonoDotted', monospace;
            font-size: 24px;
            margin: 10px;
        }

        .test-row {
            margin: 20px 0;
            padding: 10px;
            border: 1px solid #ccc;
        }
    </style>
</head>
<body>
    <h1>Notation Font Test</h1>

    <div class="test-row">
        <h2>Number System</h2>
        <div class="notation-text" id="test-number"></div>
    </div>

    <div class="test-row">
        <h2>Western System</h2>
        <div class="notation-text" id="test-western"></div>
    </div>

    <div class="test-row">
        <h2>Doremi System (with 'f')</h2>
        <div class="notation-text" id="test-doremi"></div>
    </div>

    <script>
        const ALL_CHARS = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";
        const PUA_START = 0xE000;

        function getGlyphCodepoint(baseChar, octaveShift) {
            const index = ALL_CHARS.indexOf(baseChar);
            if (index === -1) return baseChar;

            let variantIdx;
            switch (octaveShift) {
                case 1:  variantIdx = 0; break;
                case 2:  variantIdx = 1; break;
                case -1: variantIdx = 2; break;
                case -2: variantIdx = 3; break;
                case 0:  return baseChar;
                default: variantIdx = 0;
            }

            const codepoint = PUA_START + (index * 4) + variantIdx;
            return String.fromCodePoint(codepoint);
        }

        // Test cases
        const numberTest = document.getElementById('test-number');
        numberTest.textContent =
            getGlyphCodepoint('1', 0) + ' ' +
            getGlyphCodepoint('1', 1) + ' ' +
            getGlyphCodepoint('1', 2) + ' ' +
            getGlyphCodepoint('1', -1) + ' ' +
            getGlyphCodepoint('1', -2);

        const westernTest = document.getElementById('test-western');
        westernTest.textContent =
            getGlyphCodepoint('C', 0) + ' ' +
            getGlyphCodepoint('C', 1) + ' ' +
            getGlyphCodepoint('D', 2) + ' ' +
            getGlyphCodepoint('E', -1) + ' ' +
            getGlyphCodepoint('F', -2);

        const doremiTest = document.getElementById('test-doremi');
        doremiTest.textContent =
            getGlyphCodepoint('d', 0) + ' ' +
            getGlyphCodepoint('f', 1) + ' ' +
            getGlyphCodepoint('S', 2) + ' ' +
            getGlyphCodepoint('l', -1) + ' ' +
            getGlyphCodepoint('t', -2);
    </script>
</body>
</html>
```

### 2. Unit Test (Rust)

```rust
#[test]
fn test_notation_font_mapping() {
    const ALL_CHARS: &str = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";
    const PUA_START: u32 = 0xE000;

    // Test character '1' (index 0)
    assert_eq!(get_glyph_codepoint('1', 0), '1');
    assert_eq!(get_glyph_codepoint('1', 1), char::from_u32(0xE000).unwrap());
    assert_eq!(get_glyph_codepoint('1', 2), char::from_u32(0xE001).unwrap());
    assert_eq!(get_glyph_codepoint('1', -1), char::from_u32(0xE002).unwrap());
    assert_eq!(get_glyph_codepoint('1', -2), char::from_u32(0xE003).unwrap());

    // Test character 'f' (index 36 in doremi system)
    assert_eq!(get_glyph_codepoint('f', 1), char::from_u32(0xE090).unwrap());

    // Test 'F' uppercase (index 43)
    assert_eq!(get_glyph_codepoint('F', 1), char::from_u32(0xE0AC).unwrap());
}
```

## Doremi System Details

The doremi (solfege) system includes the **'f'** note:

```
Lowercase: d r m f s l t
Uppercase: D R M F S L T
```

| Note | Letter |
|------|--------|
| Do | d / D |
| Re | r / R |
| Mi | m / M |
| Fa | **f / F** ← included |
| Sol | s / S |
| La | l / L |
| Ti | t / T |

Both lowercase and uppercase versions support 1-2 dots above/below.

## Font Files

- **Font**: `/static/fonts/NotationMonoDotted.ttf` (483 KB)
- **Mapping**: `/notation_font_mapping.json` (7.4 KB)
- **Generator**: `/generate_notation_font.py` (Python 3 + FontForge)

## Regenerating the Font

If you need to modify character sets or adjust dot positioning:

```bash
python3 generate_notation_font.py
```

The script will:
1. Load `Inter.ttc` as the base font
2. Generate 4 variants for each of 47 characters (188 total glyphs)
3. Output `NotationMonoDotted.ttf` and update `notation_font_mapping.json`

## Key Implementation Rules

1. **Character Order is Sacred** - The order in `ALL_CHARS` must be identical in Python, Rust, and JavaScript
2. **PUA Start is Fixed** - Always use `0xE000` (57344) as the starting codepoint
3. **Variant Formula** - `codepoint = 0xE000 + (index × 4) + variant_index`
4. **Fallback** - When octave shift is 0, use the base character directly (no PUA lookup)
5. **Out of Range** - For octave shifts > 2 or < -2, clamp to the nearest valid variant

## Integration Checklist

- [ ] Font file deployed to `/static/fonts/NotationMonoDotted.ttf`
- [ ] CSS `@font-face` rule added with correct font path
- [ ] `ALL_CHARS` constant defined in Rust/JS with exact character order
- [ ] `get_glyph_codepoint()` function implemented in rendering layer
- [ ] Octave shift values properly passed from document model to display layer
- [ ] Visual test page created and verified in browser
- [ ] Unit tests written for codepoint mapping logic
- [ ] All four notation systems tested (Number, Western, Sargam, Doremi)
- [ ] Dots positioned correctly above and below characters

---

**Generated**: 2025-11-07
**Font Characters**: 47 base + 188 variants (4 per character)
**Systems Supported**: Number, Western, Sargam, Doremi (with 'f')
