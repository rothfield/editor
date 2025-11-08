# Font Sources Directory

This directory contains the source fonts used for generating NotationFont.ttf.

## Noto Music Font

**Download instructions:**

1. Visit: https://github.com/notofonts/music/releases
2. Download the latest `NotoMusic-Regular.ttf` file
3. Place it in this directory as `NotoMusic.ttf`

Or use wget/curl:
```bash
wget "https://github.com/notofonts/music/releases/download/v2.001/NotoMusic-Regular.ttf" -O NotoMusic.ttf
```

### File Details
- **File**: NotoMusic-Regular.ttf
- **Size**: ~292 KB
- **License**: SIL OFL 1.1
- **Coverage**: 579+ glyphs including:
  - Latin characters (A-Z, a-z, 0-9)
  - Musical symbols (notes, rests, clefs, dynamics, articulations)
  - SMuFL glyphs for accidentals and ornaments
  - Support for multiple music notation systems

### SMuFL Compatibility

Noto Music implements the Standard Music Font Layout (SMuFL) specification:
- **Accidentals**: U+E260 (flat), U+E261 (natural), U+E262 (sharp), U+E263 (double-sharp), U+E264 (double-flat)
- **Noteheads**: U+E0A0 onwards (whole, half, quarter, etc.)
- **Barlines**: U+E030 (single), U+E031 (double), U+E040+ (repeat signs)
- **Ornaments**: U+E566 (trill), U+E567 (turn), U+E56D (mordent)

This allows automatic extraction and reuse of standard music glyphs.

## Build Integration

Once NotoMusic.ttf is placed in this directory, run:
```bash
cd /home/john/editor
make fonts  # Generate NotationFont.ttf from Noto Music
```

The `scripts/fonts/generate_noto.py` script will:
1. Load Noto Music
2. Extract base pitch characters
3. Create octave variants with dots
4. Create accidental composites (char + sharp/flat)
5. Extract musical symbols
6. Output to `static/fonts/NotationFont.ttf`
