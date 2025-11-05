# Staff Notation Redraw Issue - Failing Tests Summary

## Root Cause Identified

**The staff notation tab does NOT redraw when clicking it after modifying notation on a different tab.**

### The Bug Flow

1. ✅ User types notation → staff notation renders correctly
2. ✅ User switches to lilypond tab
3. ✅ User adds more notation → document is updated (1633 → 1612 bytes)
4. ❌ User switches back to staff notation tab → **NOTHING CHANGES**
5. ❌ The SVG remains identical (8351 bytes before and after)

### Root Cause

**`exportMusicXML()` returns the SAME MusicXML even though the document changed.**

- Initial MusicXML: 733 bytes
- After adding "E F G": still 733 bytes (SHOULD be different)
- Exported MusicXML shows only a rest note, not the typed notes

This causes the OSMD renderer to skip the render with message:
```
[OSMD] MusicXML unchanged, skipping render
```

---

## Failing Tests Created

### 1. **`tests/e2e-pw/tests/staff-notation-no-redraw.spec.js`** ❌
**Status:** FAILING

Tests that SVG should be different after modifying notation on another tab.

```
❌ Error: SVGs are identical (8351 bytes before and after)
```

**What it tests:**
- Type initial notation (C-- D)
- Switch to lilypond tab
- Add more notation (E F G) while away
- Switch back to staff notation
- **EXPECTED:** SVG updates to show all notes
- **ACTUAL:** SVG unchanged

---

### 2. **`tests/e2e-pw/tests/check-musicxml-export.spec.js`** ❌
**Status:** FAILING

Tests that exportMusicXML returns different content after document change.

```
❌ BUG CONFIRMED: exportMusicXML() returns the SAME MusicXML
  - Initial MusicXML: 733 bytes
  - Updated MusicXML: 733 bytes
  - Both contain only a rest note, not the typed notation
```

**Console output:**
```
Initial MusicXML (first 200 chars): <?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <move

[After typing " E F G"]

Updated MusicXML (first 200 chars): <?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <move

MusicXMLs are identical? TRUE ❌
```

---

### 3. **`tests/e2e-pw/tests/check-document-update.spec.js`** ✅
**Status:** PASSING (confirms document IS updated)

Proves the document object changes but exportMusicXML doesn't reflect it.

```
✅ Document WAS updated while on lilypond tab
   - Initial doc length: 1633 bytes
   - Updated doc length: 1612 bytes (changed!)
   - But exportMusicXML still returns 733 bytes (unchanged)
```

---

### 4. **`tests/e2e-pw/tests/staff-notation-debug.spec.js`** ❌
**Status:** FAILING

Logs OSMD renderer behavior when switching tabs.

**Key finding:**
```
[OSMD] MusicXML unchanged, skipping render
```

This proves the hash check is preventing re-render because `exportMusicXML()` returns identical content.

---

## Running the Failing Tests

```bash
# Individual failing tests
npx playwright test tests/e2e-pw/tests/staff-notation-no-redraw.spec.js --project=chromium

npx playwright test tests/e2e-pw/tests/check-musicxml-export.spec.js --project=chromium

# Test that shows document IS updated but export isn't
npx playwright test tests/e2e-pw/tests/check-document-update.spec.js --project=chromium

# Debug logging test
npx playwright test tests/e2e-pw/tests/staff-notation-debug.spec.js --project=chromium
```

---

## What Needs to Be Fixed

The issue is in the **`exportMusicXML()` function** or the **WASM module's `exportMusicXML()` implementation**:

1. **Current behavior:** Returns the same MusicXML regardless of document changes
2. **Expected behavior:** Should export MusicXML that reflects the current document state

The document IS being updated correctly (confirmed in test #3), but the export function is not reading the updated state properly.

### Suspect Code Locations:
- `src/js/editor.js:4115-4132` - `exportMusicXML()` method
- Rust WASM function that actually exports MusicXML (in `src/api/` or `src/renderers/musicxml/`)

---

## Impact

- ✅ Clicking the staff notation tab DOES trigger `renderStaffNotation()`
- ❌ But the render is skipped because `exportMusicXML()` returns unchanged content
- ❌ User sees stale notation on screen when switching back from other tabs
- ❌ Staff notation only updates if you modify notation WHILE viewing the staff notation tab
