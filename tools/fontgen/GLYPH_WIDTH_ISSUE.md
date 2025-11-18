# Glyph Width Issue - Diagnostic Report

## Issue Summary

**Reported:** Width of generated characters not being set correctly (example: "6b")

**Root Cause:** UI rendering issue, NOT font generation issue

## Investigation Results

### ✅ Font Generation - CORRECT

Tests in `test_glyph_widths.py` **ALL PASSED**, confirming:

1. **Base characters** have correct non-zero widths
2. **Octave variants** (with dots) have SAME width as base character
3. **Accidental composites** (e.g., 1#, 6b) have SAME width as base character
4. **Combined accidental+octave** composites have SAME width as base character

Example output:
```
'6': base=572, octave=572, sharp=572, flat=572
```

All widths match! Font file is correct. ✓

### ❌ UI Rendering - INCORRECT

The issue is in **`src/js/measurement-service.js`** (lines 229-244):

#### Problem Code

```javascript
for (const char of cell.char) {
  const span = document.createElement('span');
  span.className = 'char-cell';  // ← Missing font-family!
  span.textContent = char === ' ' ? '\u00A0' : char;

  // Only applies font for TEXT cells, not pitched cells
  if (fontSize) {
    span.style.fontSize = fontSize;
  }
  if (fontFamily) {
    span.style.fontFamily = fontFamily;  // ← Only for text cells!
  }

  temp.appendChild(span);
  spans.push(span);
  charWidths.push(0);
}

// Later, measure with getBoundingClientRect()
meta.charWidths[i] = meta.spans[i].getBoundingClientRect().width;
```

#### Why It Fails

1. Measurement spans are created with class `'char-cell'`
2. CSS rule `.char-cell` (line 59 in style-manager.js) **doesn't specify font-family**
3. CSS rule `.char-cell.kind-pitched` (line 79) DOES specify `font-family: 'NotationFont'`
4. But measurement code **doesn't add the `kind-pitched` class**
5. Result: Measurements use **default browser font** instead of NotationFont
6. Widths are **completely wrong** for all pitched characters!

## The Fix

### Option 1: Add NotationFont to measurement spans (RECOMMENDED)

In `measurement-service.js`, apply NotationFont font-family to measurement spans for pitched cells:

```javascript
for (const char of cell.char) {
  const span = document.createElement('span');
  span.className = 'char-cell';
  span.textContent = char === ' ' ? '\u00A0' : char;

  // Apply proportional font and reduced size if this is a text cell
  if (fontSize) {
    span.style.fontSize = fontSize;
  }
  if (fontFamily) {
    span.style.fontFamily = fontFamily;
  } else {
    // FIX: Apply NotationFont for non-text cells (pitched, barlines, etc.)
    span.style.fontFamily = "'NotationFont', monospace";
  }

  temp.appendChild(span);
  spans.push(span);
  charWidths.push(0);
}
```

### Option 2: Add font-family to .char-cell CSS (ALTERNATIVE)

In `style-manager.js`, add default font to `.char-cell`:

```css
.char-cell {
  padding: 0;
  margin: 0;
  box-sizing: content-box;
  font-size: ${BASE_FONT_SIZE}px;
  font-family: 'NotationFont', monospace;  /* FIX: Default to NotationFont */
}
```

This would make NotationFont the default for all cells, with text cells overriding it.

## Testing Strategy

### 1. Font Generation Tests (PASSING)

```bash
python3 -m pytest tools/fontgen/test_glyph_widths.py -v -s
```

These tests verify the font file itself is correct:
- ✅ Base characters have width
- ✅ Octave variants match base width
- ✅ Accidental composites match base width
- ✅ Combined composites match base width

### 2. E2E Rendering Tests (NEW)

```bash
npx playwright test tests/e2e-pw/tests/glyph-width-rendering.spec.js
```

These tests verify UI rendering is correct:
- Base character "6" has correct width
- Flat composite "6b" has same width as "6"
- Sharp composite "1#" has same width as "1"
- Character width measurement uses NotationFont

## Resolution Steps

1. ✅ **Confirmed font is correct** (test_glyph_widths.py passes)
2. ✅ **Identified UI measurement bug** (measurement-service.js doesn't apply NotationFont)
3. ✅ **Created failing E2E test** (glyph-width-rendering.spec.js)
4. ✅ **Applied fix** (CSS-based approach - see below)
5. ✅ **Verify E2E test passes** (all 6 tests pass!)
6. ✅ **Manual verification** in browser

## Fix Applied

**Approach: Global CSS Font Application (BETTER THAN ORIGINALLY PROPOSED)**

Instead of conditionally applying fonts in JavaScript, we now use a clean CSS-based approach:

### Changes Made

1. **style-manager.js** - Added global font rule:
   ```css
   #notation-editor {
     font-family: 'NotationFont', monospace;
     font-size: ${BASE_FONT_SIZE}px;
   }

   .char-cell.kind-text,
   .lyric {
     font-family: 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif;
     font-size: ${BASE_FONT_SIZE * 0.6}px;
   }
   ```

2. **measurement-service.js** - Simplified to use CSS classes:
   ```javascript
   const cellClass = isTextCell ? 'char-cell kind-text' : 'char-cell';
   span.className = cellClass;  // CSS applies correct font
   // No inline font-family needed!
   ```

3. **cell-renderer.js** - Removed all inline font-family assignments:
   - Removed from ornament rendering
   - Removed from lyric rendering
   - Removed from cell rendering (pitched/text/whitespace)

4. **index.html** - Removed conflicting CSS rules:
   - Removed `font-family: 'Inter'` from `.char-cell`
   - Removed `font-family: 'NotationFont'` from `.char-cell.kind-barline`

### Benefits

- ✅ **Cleaner separation**: Styling in CSS, logic in JS
- ✅ **No bugs**: Can't forget to apply font in measurement code
- ✅ **Simpler**: One CSS rule instead of scattered inline styles
- ✅ **Maintainable**: Change font in one place
- ✅ **Performant**: No inline styles, better browser caching

## References

- Font generation code: `tools/fontgen/generate.py` (lines 878, 422, 607 set widths correctly)
- Font validation test: `tools/fontgen/test_glyph_widths.py`
- Measurement code: `src/js/measurement-service.js` (line 229-244, bug location)
- CSS styles: `src/js/style-manager.js` (line 59-80, font-family rules)
- E2E test: `tests/e2e-pw/tests/glyph-width-rendering.spec.js`

## Conclusion

**The font generation is working perfectly.** The issue is purely in the UI measurement code that doesn't apply the NotationFont font-family when measuring character widths. This causes all width calculations to be wrong, leading to incorrect rendering/spacing in the editor.

The fix is simple: ensure measurement spans use NotationFont when measuring pitched characters.
