# Noto Sans Setup Guide

The font generation system is now configured to use **Noto Sans** as the base font for pitch character glyphs, combined with **Noto Music** for musical symbols.

## Getting Noto Sans

You need to obtain `NotoSans-Regular.ttf` and place it in `tools/fontgen/sources/`.

### Option 1: Download from Google Fonts (Recommended)

```bash
cd tools/fontgen/sources
curl -L "https://fonts.google.com/download?family=Noto%20Sans" -o noto-sans.zip
unzip noto-sans.zip
# Find NotoSans-Regular.ttf and ensure it's named correctly
```

### Option 2: Download from GitHub

Visit: https://github.com/notofonts/sans/releases/latest

Download `NotoSans-Regular.ttf` from the release assets and place it in `tools/fontgen/sources/`

### Option 3: Install from System Package Manager

**Arch Linux:**
```bash
sudo pacman -S noto-fonts
# Then locate the file and copy it:
cp /usr/share/fonts/noto/NotoSans-Regular.ttf tools/fontgen/sources/
```

**Debian/Ubuntu:**
```bash
sudo apt-get install fonts-noto-core
cp /usr/share/fonts/opentype/noto/NotoSans-Regular.ttf tools/fontgen/sources/
```

**macOS:**
```bash
brew install noto-nerd-font
# Or use Google Fonts
```

## Verify the Setup

Once you have `NotoSans-Regular.ttf` in `tools/fontgen/sources/`, verify it:

```bash
ls -lh tools/fontgen/sources/NotoSans-Regular.ttf
file tools/fontgen/sources/NotoSans-Regular.ttf
```

Output should be:
```
NotoSans-Regular.ttf: font data, TrueType (not sure about endianness)
```

## Generate the Font

```bash
# Validate configuration (no FontForge needed)
python3 tools/fontgen/generate.py --validate-only

# Generate the complete font
python3 tools/fontgen/generate.py

# Or with debug HTML specimen
python3 tools/fontgen/generate.py --debug-html
```

## Architecture

The new dual-font approach:

- **Noto Sans** (`tools/fontgen/sources/NotoSans-Regular.ttf`)
  - Provides base glyphs for pitch notation (1-7, A-Z, a-z)
  - Professional sans-serif typography
  - Unicode comprehensive support

- **Noto Music** (`tools/fontgen/sources/NotoMusic.ttf`)
  - Provides SMuFL-compliant musical symbols
  - Accidentals (sharp, flat, natural, double sharp/flat)
  - Barlines, ornaments (mordent, turn, trill)

## Files Changed

1. **atoms.yaml** - Updated source_fonts section to reference Noto Sans
2. **generate.py** - Updated default base font path and documentation
3. **README.md** - Updated instructions and paths

## Testing

After generation, test with:

```bash
npm run dev
# Open http://localhost:8080
# Use Font Test tab in Inspector to verify glyphs render correctly
```

Check that:
- ✅ Pitch characters (1-7, A-B-C, etc.) render
- ✅ Octave variants (dots above/below) appear
- ✅ Musical symbols display correctly
