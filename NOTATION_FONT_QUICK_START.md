# Notation Font - Quick Start

## What Was Generated

✅ **Font File**: `static/fonts/NotationMonoDotted.ttf` (483 KB)
- 47 base characters × 4 variants = 188 glyphs
- Private Use Area (PUA) mapping: 0xE000 - 0xE0BB
- Based on Inter font (clean, readable, monospace)

✅ **Mapping File**: `notation_font_mapping.json` (7.4 KB)
- Lookup table: character → codepoint
- All codepoints documented
- Can be used by build tools

✅ **Generator Script**: `generate_notation_font.py`
- Reusable Python 3 + FontForge
- Modifiable if you need to change character sets
- Includes dot positioning logic

## Four Notation Systems

### 1. Number System (default in editor)
```
1 2 3 4 5 6 7
```
- 7 characters, each with 1-2 dots above/below
- Example: "1" with 1 dot above = 0xE000

### 2. Western System (A-B-C-D-E-F-G letters)
```
C D E F G A B  (uppercase)
c d e f g a b  (lowercase)
```
- 14 characters (7 × 2 cases), each with variants
- Example: "C" with 2 dots above = 0xE01D

### 3. Sargam System (Indian classical)
```
S r R g G m M P d D n N
```
- 12 characters, each with variants
- S=Sa, r=re(lower), R=Re(upper), g=ga(lower), G=Ga(upper), etc.

### 4. Doremi System (Solfege - **includes 'f'**)
```
d r m f s l t  (lowercase)
D R M F S L T  (uppercase)
```
- 14 characters, each with variants
- **Note**: Both 'f' and 'F' are included (fa note in solfege)

## Character Order (CRITICAL!)

This **exact** order must be used everywhere:

```
1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT
```

**Breaking it down:**
- Indices 0-6: Number system
- Indices 7-20: Western system
- Indices 21-32: Sargam system
- Indices 33-46: Doremi system

## The Formula

For any base character with octave shift:

```
codepoint = 0xE000 + (character_index × 4) + variant_index
```

**Variant indices:**
- 0 = 1 dot above
- 1 = 2 dots above
- 2 = 1 dot below
- 3 = 2 dots below

**Example:**
- Character '1' is at index 0
- 1 dot above = 0xE000 + (0 × 4) + 0 = **0xE000**
- 2 dots above = 0xE000 + (0 × 4) + 1 = **0xE001**
- 1 dot below = 0xE000 + (0 × 4) + 2 = **0xE002**
- 2 dots below = 0xE000 + (0 × 4) + 3 = **0xE003**

**Another example:**
- Character 'f' is at index 36 in the doremi section
- 1 dot above = 0xE000 + (36 × 4) + 0 = **0xE090**
- 2 dots above = 0xE000 + (36 × 4) + 1 = **0xE091**

## Implementation Steps

### In CSS

```css
@font-face {
    font-family: 'NotationMonoDotted';
    src: url('/fonts/NotationMonoDotted.ttf') format('truetype');
}

.notation { font-family: 'NotationMonoDotted', monospace; }
```

### In JavaScript

```javascript
const ALL_CHARS = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";

function getGlyph(baseChar, octaveShift) {
    const idx = ALL_CHARS.indexOf(baseChar);
    if (idx === -1 || octaveShift === 0) return baseChar;

    const variant = octaveShift > 0 ? octaveShift - 1 : 2 - octaveShift;
    const cp = 0xE000 + (idx * 4) + variant;
    return String.fromCodePoint(cp);
}

// Usage
getGlyph('1', 1)  // '1' with 1 dot above
getGlyph('f', -2) // 'f' with 2 dots below
getGlyph('C', 0)  // 'C' with no dots (returns 'C')
```

### In Rust

```rust
const ALL_CHARS: &str = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";

fn get_glyph(base_char: char, octave_shift: i8) -> char {
    let idx = ALL_CHARS.find(base_char)? as u32;
    if octave_shift == 0 { return base_char; }

    let variant = match octave_shift {
        1  => 0,
        2  => 1,
        -1 => 2,
        -2 => 3,
        _  => 0,
    };

    let cp = 0xE000 + (idx * 4) + variant;
    char::from_u32(cp).unwrap_or(base_char)
}
```

## Testing

### Quick Visual Test

Open this in a browser with the font deployed:

```html
<style>
    @font-face {
        font-family: 'NotationMonoDotted';
        src: url('/fonts/NotationMonoDotted.ttf') format('truetype');
    }
    .test { font-family: 'NotationMonoDotted', monospace; font-size: 32px; }
</style>

<div class="test">
    1 with 1 dot: &#xe000;<br>
    1 with 2 dots: &#xe001;<br>
    C with 1 dot: &#xe01c;<br>
    f with 1 dot: &#xe090;<br>
</div>
```

### Verify All Systems

```javascript
// Test at least one character from each system
const tests = [
    { char: '1', shift: 1, label: 'Number (1 with 1 dot)' },
    { char: 'C', shift: 2, label: 'Western (C with 2 dots)' },
    { char: 'S', shift: 1, label: 'Sargam (S with 1 dot)' },
    { char: 'f', shift: 1, label: 'Doremi (f with 1 dot)' },
];

tests.forEach(test => {
    const glyph = getGlyph(test.char, test.shift);
    console.log(`${test.label}: ${glyph.charCodeAt(0).toString(16)}`);
});
```

## Regenerating (if needed)

If you need to adjust dots, add characters, or change the base font:

```bash
cd /home/john/editor
python3 generate_notation_font.py
```

The script will:
- Load `static/fonts/Inter.ttc`
- Generate new composites with dots
- Write `NotationMonoDotted.ttf`
- Update `notation_font_mapping.json`

## File Locations

```
/home/john/editor/
  ├── static/fonts/
  │   └── NotationMonoDotted.ttf      ← Use this in CSS
  ├── notation_font_mapping.json      ← Reference codepoints here
  ├── generate_notation_font.py       ← Rerun if needed
  ├── NOTATION_FONT_IMPLEMENTATION.md ← Full implementation details
  └── NOTATION_FONT_QUICK_START.md    ← This file
```

## Key Points to Remember

1. **Character order is sacred** - must be identical in all code
2. **Formula is simple** - multiply index by 4, add variant
3. **Codepoints are stable** - won't change unless font is regenerated
4. **Fallback safely** - unrecognized chars or octave_shift=0 returns base character
5. **All systems work the same way** - no special logic per notation type

## Next Steps

1. ✅ Font generated → Deploy to production
2. Add CSS `@font-face` rule → Use in your stylesheets
3. Implement `getGlyph()` function → In JS and/or Rust
4. Connect to document model → Pass octave shifts to rendering
5. Test all 4 systems → Verify dots position correctly
6. Use in cells/notes → Display notation with octave indicators

---

**System Support Summary:**
- ✅ Number: `1234567` (default, 7 chars)
- ✅ Western: `CDEFGABcdefgab` (14 chars)
- ✅ Sargam: `SrRgGmMPdDnN` (12 chars)
- ✅ **Doremi**: `drmfsltDRMFSLT` (**includes 'f'**, 14 chars)

**Total**: 47 base characters, 188 glyphs (with variants)

**Status**: ✅ Ready to integrate
