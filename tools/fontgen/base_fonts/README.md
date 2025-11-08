# Base Fonts for Notation Font Generation

This directory contains (or references) the base fonts used to generate the final NotationMonoDotted.ttf font file.

## Directory Structure

```
tools/fontgen/base_fonts/
├── README.md                    (this file)
├── Bravura.otf                  (optional - SMuFL music notation symbols)
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

### 2. Bravura.otf (Symbols - Optional for Development)

**Purpose**: Provides musical symbols (sharps, flats, barlines, ornaments) extracted into the final composite font

**License**: SIL Open Font License (OFL)
- Free to use and modify
- Can be vendored in the repo
- See LICENSE.Bravura (below)

**Where to Get It**:

Option A: Download from GitHub (Recommended)
```bash
# Navigate to this directory
cd tools/fontgen/base_fonts

# Download Bravura from official source
curl -L https://github.com/steinbergmedia/bravura/raw/master/Bravura.otf \
  -o Bravura.otf

# Verify download (optional)
file Bravura.otf  # Should show: "Font Data"
```

Option B: Manual Download
1. Visit https://github.com/steinbergmedia/bravura/releases
2. Download the latest `Bravura.otf`
3. Place in this directory: `tools/fontgen/base_fonts/Bravura.otf`

Option C: Use System Bravura (if available)
- macOS: Bravura might be installed with Dorico or Finale
- Linux: Install via package manager if available
- Update `--bravura-font` path in generator or Makefile

### Font Generation Modes

**Development Mode (Default - Bravura Optional)**
```bash
python3 generate.py  # Lenient; skips Bravura if not found
```
- Missing Bravura? No problem - generates note symbols only
- Good for quick iteration on dot positioning
- Symbols appear as empty glyphs (no barlines/ornaments)

**Strict Mode (Requires Bravura)**
```bash
python3 generate.py --strict  # Fails if Bravura is missing
```
- Use for CI/production builds
- Ensures complete feature set is present
- Fails loudly if Bravura is missing

---

## Bravura License

Bravura font is provided under the **SIL Open Font License (OFL) 1.1**

### License Text

Copyright © 2014 Steinberg Media Technologies GmbH

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

---

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or resold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified after the
Copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, or other person
who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software to use, study, modify and redistribute
copies of the Font Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or resold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, distribution-level headers
or in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software or its derivatives.

TERMINATION
This license becomes void, if any of the above conditions are not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR OTHER
DEALINGS IN THE FONT SOFTWARE.

---

## Verifying Glyph Names

When using Bravura, the generator needs to find specific glyphs. To verify glyph names:

### Using FontForge

```bash
fontforge Bravura.otf
# Go to View → Glyph Info
# Search for glyph names like:
#   - ornamentMordent (U+E56D)
#   - barlineSingle (U+E030)
#   - ornamentTrill (U+E566)
```

### Using Command Line

```bash
# macOS/Linux with fonttools
from fontTools.ttLib import TTFont
font = TTFont('Bravura.otf')
glyph_order = font.getGlyphOrder()
print([g for g in glyph_order if 'ornament' in g.lower()])
```

---

## Troubleshooting

### "Bravura font not found"

**Development mode:**
```bash
python3 generate.py  # Continues without Bravura
```

**Strict mode:**
```bash
python3 generate.py --strict  # Fails; requires Bravura
```

**Solution:** Download Bravura to this directory

```bash
curl -L https://github.com/steinbergmedia/bravura/raw/master/Bravura.otf \
  -o tools/fontgen/base_fonts/Bravura.otf
```

### "Could not find Bravura glyph: ornamentMordent"

This means the Bravura.otf file doesn't have that glyph name, or it's named differently in this version.

**Solution:**
1. Verify the glyph exists in Bravura (see "Verifying Glyph Names" above)
2. Update atoms.yaml with the correct glyph name
3. Check SMuFL documentation: https://w3c.github.io/smufl/latest/tables/common-ornaments.html

### Font generation is slow

Bravura is a large font (~500KB). If generation takes > 30 seconds:
- This is normal
- Use `--debug-html` flag to check output without regenerating
- Caching would require more infrastructure

---

## Future Enhancements

### Alternative Base Fonts

You could swap Inter for another monospace font:
- **IBM Plex Mono** (larger glyph set)
- **JetBrains Mono** (developer-friendly)
- **Courier New** (classic)

To use a different base font:
```bash
python3 generate.py --base-font path/to/your-font.ttf
```

### Alternative Symbol Fonts

Instead of Bravura, you could use:
- **Noto Music** (free, Google)
- **MuseScore fonts** (free, open source)
- **Custom symbols** (roll your own)

Just update atoms.yaml and point the generator to the font.

### Pre-generated Symbol Subsets

In the future, you could extract just the needed Bravura glyphs into a smaller font:
```bash
# Extract only 11 glyphs we need (not implemented yet)
# Result: ~50KB instead of 500KB
```

---

## Quick Start

### 1. Get Bravura (one-time setup)

```bash
cd tools/fontgen/base_fonts
curl -L https://github.com/steinbergmedia/bravura/raw/master/Bravura.otf \
  -o Bravura.otf
ls -lh Bravura.otf  # Verify download
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
ls -lh static/fonts/NotationMonoDotted.ttf
file static/fonts/NotationMonoDotted.ttf  # Should say "Font Data"
```

### 4. Test in Browser

```bash
npm run dev
# Open http://localhost:8080
# Check that all notation systems render with dots
```

---

## References

- **SMuFL Spec**: https://w3c.github.io/smufl/latest/
- **Bravura GitHub**: https://github.com/steinbergmedia/bravura
- **Bravura License**: https://github.com/steinbergmedia/bravura/blob/master/LICENSE.txt
- **OFL License**: http://scripts.sil.org/OFL

---

**Last Updated**: 2025-11-08
**Status**: Ready for use
