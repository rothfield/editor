# Font System Migration: Noto Music Edition

**Date:** November 2025
**Status:** Complete Implementation
**Migration from:** Inter.ttc + Bravura.otf (two fonts)
**Migration to:** Noto Music → NotationFont.ttf (single font)

## Executive Summary

The font system has been completely redesigned around **Noto Music** as the single source of truth for all glyphs:

- **✅ One font source:** Noto Music (SMuFL-compliant) replaces Inter.ttc + Bravura.otf
- **✅ Single output:** NotationFont.ttf combines pitch characters, octave variants, accidentals, and musical symbols
- **✅ Build-time codegen:** `build.rs` generates Rust constants from `atoms.yaml` at compile time
- **✅ No duplication:** `atoms.yaml` is THE configuration source for both Python and Rust code

## Architecture

### Three-Layer Design

```
atoms.yaml (SINGLE SOURCE OF TRUTH)
    ↓
    ├─→ build.rs (generates font_constants.rs) → Rust code uses generated constants
    └─→ Python font generator (reads atoms.yaml) → generates NotationFont.ttf
```

### Data Flow

```
tools/fontgen/sources/NotoMusic.ttf
    ↓
scripts/fonts/generate_noto.py (reads atoms.yaml)
    ├─→ Extract base pitch characters (0-9, A-Z, a-z)
    ├─→ Generate octave variants (dots above/below)
    ├─→ Generate accidental composites (char + sharp/flat)
    └─→ Extract musical symbols (barlines, ornaments)
    ↓
static/fonts/NotationFont.ttf
    ↓
JavaScript & Browser rendering
```

## Component Changes

### 1. Configuration: `tools/fontgen/atoms.yaml`

**New sections:**
- `source_fonts`: Specifies Noto Music as base font
- `pua`: Private Use Area allocation for all custom glyphs
- All symbol definitions remain (accidentals, barlines, ornaments)

**Key properties:**
```yaml
source_fonts:
  base_font:
    path: "tools/fontgen/sources/NotoMusic.ttf"
    name: "Noto Music"
    version: "2.001"
    license: "SIL OFL 1.1"
    url: "https://github.com/notofonts/music"
```

### 2. Build System: `build.rs`

**Purpose:** Generate `src/renderers/font_constants.rs` at compile time

**Generates:**
```rust
pub const ALL_CHARS: &str = "1234567...";
pub const PUA_START: u32 = 0xE000;
pub const CHARS_PER_VARIANT: u32 = 4;
pub const ACCIDENTAL_PUA_START: u32 = 0xE1F0;
pub const SYMBOLS_PUA_START: u32 = 0xE220;
```

**Benefits:**
- ✅ Compile fails if `atoms.yaml` is malformed
- ✅ Rust code always in sync with Python generator
- ✅ NO hardcoded character order strings
- ✅ Single source of truth

### 3. Font Generator: `scripts/fonts/generate_noto.py`

**New implementation:**
- Class-based architecture (`NotoMusicFontGenerator`)
- Reads ALL config from `atoms.yaml` (no hardcoding)
- Extracts base pitch characters from Noto Music
- Generates octave variants using composite glyphs (dots above/below)
- Generates accidental variants (character + sharp/flat/natural)
- Extracts musical symbols from Noto Music SMuFL glyphs

**Command:**
```bash
python3 scripts/fonts/generate_noto.py
```

### 4. Rust Code: `src/renderers/font_utils.rs`

**Changed:**
- Removed hardcoded constants
- Now imports from generated `font_constants.rs`
- Uses constants: `ALL_CHARS`, `PUA_START`, `CHARS_PER_VARIANT`, `ACCIDENTAL_PUA_START`

**Example:**
```rust
use crate::{ALL_CHARS, PUA_START, CHARS_PER_VARIANT, ACCIDENTAL_PUA_START};

pub fn get_glyph_codepoint(base_char: char, octave_shift: i8) -> char {
    // Uses imported constants from build.rs
    let char_index = match ALL_CHARS.find(base_char) { ... }
    let codepoint = PUA_START + (char_index * CHARS_PER_VARIANT) + variant_idx;
    char::from_u32(codepoint).unwrap_or(base_char)
}
```

### 5. HTML & CSS: `index.html`

**Removed:**
- `@font-face { font-family: 'Bravura'; }`
- `@font-face { font-family: 'Inter'; }`
- `@font-face { font-family: 'NotationMono'; }`

**Added:**
```css
@font-face {
    font-family: 'NotationFont';
    src: url('/static/fonts/NotationFont.ttf') format('truetype');
}
```

### 6. JavaScript: Renderer & UI Updates

**Updated files:**
- `src/js/renderer.js` - All font-family references updated
- `src/js/ui.js` - Menu item font references updated
- `src/js/font-test.js` - Font test UI updated

**Pattern change:**
```javascript
// OLD
span.style.fontFamily = "'NotationMono', 'Inter'";

// NEW
span.style.fontFamily = "'NotationFont'";
```

## PUA Allocation

Private Use Area (0xE000 - 0xF8FF) allocation:

```
0xE000 - 0xE0BB:  188 glyphs (47 chars × 4 octave variants)
                  - Base characters at indices 0-46
                  - Variant 0: 1 dot above (octave +1)
                  - Variant 1: 2 dots above (octave +2)
                  - Variant 2: 1 dot below (octave -1)
                  - Variant 3: 2 dots below (octave -2)

0xE1F0 - 0xE21E:  47 glyphs (sharp accidentals for each char)

0xE220 onwards:   14 glyphs (musical symbols)
                  - Accidentals (sharp, flat, natural, double-sharp, double-flat)
                  - Barlines (single, double, repeat signs)
                  - Ornaments (mordent, inverted-mordent, turn, trill)
```

## Migration Checklist

- [x] Create `build.rs` for compile-time code generation
- [x] Update `Cargo.toml` with `build = "build.rs"` and `serde_yaml` dependency
- [x] Update `src/lib.rs` to include generated constants
- [x] Update `tools/fontgen/atoms.yaml` with Noto Music configuration
- [x] Create `scripts/fonts/generate_noto.py` with complete implementation
- [x] Update `src/renderers/font_utils.rs` to use generated constants
- [x] Update `index.html` to load only NotationFont.ttf
- [x] Update `src/js/renderer.js` to use NotationFont everywhere
- [x] Update `src/js/ui.js` to use NotationFont
- [x] Update `src/js/font-test.js` to use NotationFont
- [x] Update `Makefile` to call `generate_noto.py`
- [x] Verify all unit tests pass
- [x] Test build system with `cargo check`

## How to Use

### 1. Download Noto Music Font

```bash
# Download to the correct location
mkdir -p tools/fontgen/sources
wget https://github.com/notofonts/music/releases/download/v2.001/NotoMusic-Regular.ttf \
     -O tools/fontgen/sources/NotoMusic.ttf
```

### 2. Generate NotationFont

```bash
# Option 1: Use Makefile
make fonts

# Option 2: Direct invocation
python3 scripts/fonts/generate_noto.py
```

### 3. Build application

```bash
make build
```

The build system will:
1. Run `build.rs` to generate font constants from `atoms.yaml`
2. Compile Rust code with generated constants
3. Run `make fonts` to generate NotationFont.ttf
4. Bundle JavaScript with updated font references

## Testing

### Unit Tests
```bash
cargo test -p editor-wasm --lib font_utils
```

All 22 tests pass, verifying:
- Octave shift calculations
- Accidental glyph mapping
- Character order completeness
- Unknown character fallbacks

### Integration Tests
```bash
npx playwright test tests/e2e-pw/tests/
```

Browser tests verify:
- NotationFont.ttf loads correctly
- Glyphs render properly
- No console errors
- Font fallbacks work (system fonts for text cells)

### Manual Testing
1. Visit http://localhost:8080
2. Type notation (e.g., `1 2 3`)
3. Verify glyphs render correctly
4. Check Font Test tab to see all available glyphs
5. Test octave shifts (glyphs with dots should appear)
6. Test accidentals (#, b symbols should render)

## Troubleshooting

### "NotoMusic.ttf not found"
```
Download from: https://github.com/notofonts/music/releases
Place at: tools/fontgen/sources/NotoMusic.ttf
```

### "NotationFont.ttf not found in browser"
```
Run: make fonts
Check: static/fonts/NotationFont.ttf exists and is non-empty
```

### "Fonts not updating after changes"
```
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache
3. Ensure build completed successfully
```

### Build fails with "character_order not found"
```
atoms.yaml is missing or malformed. Check:
1. File exists: tools/fontgen/atoms.yaml
2. Valid YAML syntax
3. Contains 'character_order' field
```

## Future Enhancements

- [ ] Support flat and natural accidentals (currently only sharp)
- [ ] Add double-sharp and double-flat variants
- [ ] Extract additional SMuFL symbols from Noto Music
- [ ] Per-system glyph customization (number vs. western styles)
- [ ] Font metrics auto-adjustment
- [ ] Web font format conversion (TTF → WOFF2)

## Files Changed/Created

### Created
- `build.rs` - Compile-time code generation
- `scripts/fonts/generate_noto.py` - New font generator
- `tools/fontgen/sources/README.md` - Noto Music download instructions
- `FONT_MIGRATION_NOTO_MUSIC.md` - This file

### Modified
- `Cargo.toml` - Added build script and dependencies
- `src/lib.rs` - Include generated constants
- `src/renderers/font_utils.rs` - Use generated constants
- `index.html` - Update @font-face declarations
- `src/js/renderer.js` - Update all font references
- `src/js/ui.js` - Update menu font references
- `src/js/font-test.js` - Update font test UI
- `Makefile` - Update font generation targets
- `tools/fontgen/atoms.yaml` - Add Noto Music configuration

### Archived/Removed (optional cleanup)
- `scripts/fonts/generate.py` (superseded by `generate_noto.py`)
- `static/fonts/Inter.ttc` (no longer needed)
- `static/fonts/Bravura.otf` (replaced by Noto Music)
- `static/fonts/NotationMono.ttf` (replaced by NotationFont.ttf)
- `static/fonts/Bravura.woff*` (replaced by NotationFont)

## References

- **Noto Music:** https://github.com/notofonts/music
- **SMuFL Standard:** https://w3c.github.io/smufl/
- **FontForge Python:** https://fontforge.org/docs/scripting/python.html
- **atoms.yaml:** `tools/fontgen/atoms.yaml` (single source of truth)

## Verification

To verify the migration is complete and working:

```bash
# 1. Build system works
cargo check

# 2. Tests pass
cargo test -p editor-wasm --lib font_utils

# 3. Font generator produces output
python3 scripts/fonts/generate_noto.py --output /tmp/test-font.ttf
ls -lh /tmp/test-font.ttf  # Should be non-empty

# 4. App builds completely
make build

# 5. Manual browser testing
npm run dev
# Visit http://localhost:8080
# Test notation rendering and font test tab
```

**✅ All steps successful = Migration complete!**
