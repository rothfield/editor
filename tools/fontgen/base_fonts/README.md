# Base Fonts for Notation Font Generation

This directory contains (or references) the base fonts used to generate the final NotationFont.ttf font file.

## Directory Structure

```
tools/fontgen/
├── sources/
│   ├── NotoMusic.ttf            (SMuFL music notation symbols - required)
│   └── README.md
├── README.md                    (this file)
└── (Inter.ttc from static/fonts/ - referenced, not stored here)
```

---

## Fonts

### 1. Inter.ttc (Base Font for Notes)

**Purpose**: Provides the base monospace characters (1-7, A-Z, etc.) that form the backbone of the notation system

**Location**: `../../static/fonts/Inter.ttc`

**Why Inter?**
- Clean, modern monospace font
- Excellent for technical notation
- Clear character differentiation
- Open Source (OFL)

**Do I need to add it here?** No - Inter is already in the repo at `static/fonts/Inter.ttc`

---

### 2. NotoMusic.ttf (Symbols - SMuFL Compliant)

**Purpose**: Provides all SMuFL musical symbols (barlines, accidentals, ornaments) that are included as-is in NotationFont.ttf

**Location**: `tools/fontgen/sources/NotoMusic.ttf`

**License**: SIL Open Font License (OFL)
- Free to use and modify
- Already checked into repo
- See https://github.com/notofonts/music

**What's Included**:
- Barlines (single, double, repeat left/right/both)
- Accidentals (sharp, natural, flat, double-sharp, double-flat)
- Ornaments (trill, turn, mordent)
- All SMuFL-compliant music glyphs at standard codepoints (U+E000+)

**Updates**:
To get the latest version of Noto Music:
```bash
# Download from official source
curl -L https://github.com/notofonts/music/raw/main/fonts/NotoMusic-Regular.ttf \
  -o tools/fontgen/sources/NotoMusic.ttf

# Verify
file tools/fontgen/sources/NotoMusic.ttf  # Should show: "Font Data"
```

### Font Generation Modes

**Development Mode (Default)**
```bash
python3 generate.py  # Lenient; skips Noto Music symbols if not found
```
- Missing Noto Music? Generates note glyphs only (no barlines/symbols)
- Good for quick iteration on dot positioning
- Symbols appear as empty glyphs

**Strict Mode (Requires Noto Music)**
```bash
python3 generate.py --strict  # Fails if Noto Music is missing
```
- Use for CI/production builds
- Ensures complete feature set is present
- Fails loudly if Noto Music is missing

---

## Noto Music License

Noto Music font is provided under the **SIL Open Font License (OFL) 1.1**

For complete license text, see: https://github.com/notofonts/music/blob/main/LICENSE

The OFL permits free use, modification, and redistribution as long as:
- The font is not sold as standalone
- The license is included with any distributions
- Reserved names are not used

---

## Troubleshooting

### "Noto Music font not found"

**Development mode:**
```bash
python3 generate.py  # Continues without Noto Music symbols
```

**Strict mode:**
```bash
python3 generate.py --strict  # Fails; requires Noto Music
```

**Solution:** Download Noto Music to the sources directory

```bash
mkdir -p tools/fontgen/sources
curl -L https://github.com/notofonts/music/raw/main/fonts/NotoMusic-Regular.ttf \
  -o tools/fontgen/sources/NotoMusic.ttf
```

### "Could not import Noto Music glyphs"

This typically means the Noto Music file is corrupt or unavailable. Solutions:

1. **Re-download Noto Music:**
   ```bash
   curl -L https://github.com/notofonts/music/raw/main/fonts/NotoMusic-Regular.ttf \
     -o tools/fontgen/sources/NotoMusic.ttf
   ```

2. **Verify the download:**
   ```bash
   file tools/fontgen/sources/NotoMusic.ttf
   # Should output: "Font Data"
   ```

3. **Use development mode (skip symbols):**
   ```bash
   python3 tools/fontgen/generate.py
   # Will generate note glyphs only, without barlines/symbols
   ```

## Quick Start

### 1. Ensure Noto Music is available (already in repo)

```bash
ls -lh tools/fontgen/sources/NotoMusic.ttf
file tools/fontgen/sources/NotoMusic.ttf  # Should say "Font Data"
```

### 2. Generate Font

```bash
cd /home/john/editor
python3 tools/fontgen/generate.py --strict
# or
make fonts
```

### 3. Verify

```bash
ls -lh static/fonts/NotationFont.ttf
ls -lh static/fonts/NotationFont-map.json
file static/fonts/NotationFont.ttf  # Should say "Font Data"
```

### 4. Test in Browser

```bash
npm run dev
# Open http://localhost:8080
# Check that all notation systems render with dots and barlines/symbols
```

---

## References

- **SMuFL Spec**: https://w3c.github.io/smufl/latest/
- **Noto Music GitHub**: https://github.com/notofonts/music
- **Noto Music License**: https://github.com/notofonts/music/blob/main/LICENSE
- **OFL License**: http://scripts.sil.org/OFL

---

**Last Updated**: 2025-11-08
**Status**: Ready for use
