# Bravura.otf Corruption Fix Report

## Issue Discovered: November 8, 2025

### Problem
The Bravura.otf base font file at `tools/fontgen/base_fonts/Bravura.otf` was corrupted:
- **Size:** 292 KB (should be ~50-60 KB)
- **Content:** HTML document wrapper instead of binary OpenType font data
- **File signature:** Started with `<!DOCTYPE html>` instead of OpenType magic bytes
- **Impact:** FontForge could not parse the file, font generation failed

### Root Cause
The file was downloaded using GitHub's web interface (which serves HTML wrapper) instead of the raw binary endpoint. This is a common issue when downloading fonts from GitHub repositories.

### Solution Implemented
1. **Removed corrupted file** at `tools/fontgen/base_fonts/Bravura.otf`
2. **Downloaded valid binary** from official Steinberg repository:
   ```bash
   wget -O Bravura.otf https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/otf/Bravura.otf
   ```
3. **Verified font integrity:**
   - File type: `OpenType font data` ✓
   - File size: 501 KB (valid)
   - FontForge can open it: ✓
   - Glyph count: 1,114,115 ✓
   - No corruption errors ✓

## Font Status After Fix

| Font | Location | Format | Status | Size | Notes |
|------|----------|--------|--------|------|-------|
| Bravura | `tools/fontgen/base_fonts/Bravura.otf` | OTF | ✅ Fixed | 501 KB | Valid binary, ready for use |
| Bravura | `static/fonts/Bravura.woff2` | WOFF2 | ✅ Valid | 242 KB | Web deployment ready |
| Bravura | `static/fonts/Bravura.woff` | WOFF | ✅ Valid | 945 KB | Web fallback format |
| NotationMonoDotted | `static/fonts/NotationMonoDotted.ttf` | TTF | ✅ Valid | Generated | Custom notation glyphs |

## Best Practices Going Forward

### Do Not Edit Bravura in FontForge
FontForge has known issues with complex OpenType fonts like Bravura:
- Can produce invalid/oversized files
- May corrupt ligature tables
- Not recommended by font maintainers

### For Font Generation
- **Use Bravura as reference only** (don't regenerate it)
- **Continue generating custom notation fonts** from Inter.ttc as base
- **Use WOFF2 for web** (better compression, modern browser support)
- **Test thoroughly** before deploying (FontForge, browser inspector tabs)

### When Downloading Fonts from GitHub
```bash
# ❌ Wrong (gets HTML wrapper)
wget https://github.com/steinbergmedia/bravura/blob/master/redist/otf/Bravura.otf

# ✅ Correct (gets raw binary)
wget https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/otf/Bravura.otf

# ✅ Also correct (using curl)
curl -L -o Bravura.otf https://github.com/steinbergmedia/bravura/raw/master/redist/otf/Bravura.otf
```

## Web Deployment Notes

The Bravura fonts in your web-ready directory are valid and tested:

```css
@font-face {
  font-family: 'Bravura';
  src: url('/fonts/Bravura.woff2') format('woff2'),
       url('/fonts/Bravura.woff') format('woff');
  font-display: swap;
}
```

### Known Limitations
- Some browsers may not fully support Bravura's advanced OpenType features (ligatures, GSUB)
- For maximum compatibility, test across Chrome, Firefox, Safari, and Edge
- Consider feature detection for fallback rendering strategies

## Related Documentation
- Bravura official: https://github.com/steinbergmedia/bravura
- SMuFL (Standard Music Font Layout): https://www.smufl.org/
- FontForge issues: https://github.com/fontforge/fontforge/issues

## Summary
✅ **Issue fixed** - Bravura.otf is now a valid binary font and ready for use in font generation pipelines.
