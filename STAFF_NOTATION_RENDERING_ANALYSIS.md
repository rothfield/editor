# Staff Notation Rendering: Complete Architecture & Double-Render Issue Analysis

## Executive Summary

The staff notation is rendered using **OSMD (OpenSheetMusicDisplay)** and there is a potential **double-render bug** occurring on initial page load and tab switches. The issue stems from calling `renderStaffNotation()` twice during initialization.

---

## File Structure & Key Components

### 1. Main Entry Point
**File:** `/home/john/editor/src/js/main.js`
- Initializes `MusicNotationApp` and all components
- Sets up resize callback that triggers re-renders
- Initializes LilyPond tabs after app setup

### 2. HTML Structure
**File:** `/home/john/editor/index.html` (lines 593-702)
- Staff notation container: `<div id="staff-notation-container">` (line 633)
- Located in inspector panel's right sidebar
- Contains MIDI playback controls below it
- Tab buttons for switching between renderers

### 3. OSMD Renderer
**File:** `/home/john/editor/src/js/osmd-renderer.js`

**Key Methods:**
- `constructor(containerId)` - Initializes with container ID (`'staff-notation-container'`)
- `init()` - Creates OSMD instance with configuration
- `render(musicxml)` - Main render method with caching support
- `hashMusicXml(musicxml)` - Hash function to skip unnecessary re-renders
- `getCachedRender(hash)` / `setCachedRender(hash, svg)` - IndexedDB caching

**Render Flow:**
```
render(musicxml)
  ├─ Hash the MusicXML content
  ├─ Check cache hit
  │  ├─ [HIT] Load cached SVG from IndexedDB
  │  ├─ Still load MusicXML to OSMD (for audio player)
  │  └─ Return early
  └─ [MISS] Full render:
     ├─ Call init() to create OSMD instance
     ├─ Load MusicXML
     ├─ Set zoom (0.75)
     ├─ Call osmd.render()
     ├─ Cache the rendered SVG
     └─ Reload audio player
```

**Critical Member Variables:**
- `this.renderToken` - Used to cancel outdated renders
- `this.lastMusicXmlHash` - Tracks last rendered MusicXML to avoid re-rendering unchanged content
- `this.osmd` - The OSMD instance (set to null during resize redraw)

---

## Editor Integration

**File:** `/home/john/editor/src/js/editor.js`

### Initialization (lines 93-95)
```javascript
this.osmdRenderer = new OSMDRenderer('staff-notation-container');
console.log('OSMD renderer initialized (with audio playback support)');
```

### Rendering Entry Point (line 2957-2959)
```javascript
async renderStaffNotation() {
  return this.exportManager.renderStaffNotation();
}
```

---

## Export Manager

**File:** `/home/john/editor/src/js/managers/ExportManager.js` (lines 158-183)

```javascript
async renderStaffNotation() {
  if (!this.editor.osmdRenderer) {
    console.warn('OSMD renderer not initialized');
    return;
  }

  const musicxml = await this.exportMusicXML();
  if (!musicxml) {
    console.warn('Cannot render staff notation: MusicXML export failed');
    return;
  }

  try {
    const startTime = performance.now();
    await this.editor.osmdRenderer.render(musicxml);  // <-- KEY CALL
    const renderTime = performance.now() - startTime;
    console.log(`Staff notation rendered in ${renderTime.toFixed(2)}ms`);
  } catch (error) {
    console.error('Staff notation rendering failed:', error);
  }
}
```

---

## UI Tab System & Rendering Triggers

**File:** `/home/john/editor/src/js/ui.js`

### Initialization Flow
1. **Line 279:** `setupTabs()` calls `this.switchTab('staff-notation')`
2. **Line 36:** `initialize()` calls `this.restoreTabPreference()`
3. **Line 469:** `restoreTabPreference()` may call `this.switchTab(savedTab)` if localStorage has a saved tab
4. Or **Line 479:** Falls back to `this.switchTab('staff-notation')`

### The Tab Switching Logic (lines 374-429)

```javascript
async switchTab(tabName) {
  // Hide all tabs, show selected tab (visual only)
  // ...

  // CRITICAL RENDERING TRIGGER (lines 403-418)
  if (tabName === 'staff-notation' && this.editor) {
    // Clear the hash cache to force a fresh render
    if (this.editor.osmdRenderer) {
      this.editor.osmdRenderer.lastMusicXmlHash = null;
    }

    // Refocus editor
    this.returnFocusToEditor();

    // Wait 50ms for focus to settle
    await new Promise(resolve => setTimeout(resolve, 50));

    // **RENDER CALL #1**
    await this.editor.renderStaffNotation();
  }

  // Update inspector tab content (lines 425-428)
  if (this.editor) {
    // **POSSIBLE RENDER CALL #2** - if this updates the MusicXML tab
    this.editor.updateDocumentDisplay();
  }
}
```

---

## The Double-Render Bug

### Scenario: Initial Page Load

1. **main.js line 78:** `this.ui.initialize()`
   
2. **ui.js line 33-36:** `initialize()` is called
   - Line 279: `setupTabs()` → calls `this.switchTab('staff-notation')`
     - Lines 403-418: Renders staff notation (**RENDER #1**)
   - Line 36: `restoreTabPreference()` is called
     - Line 469: If no saved tab, calls `this.switchTab('staff-notation')` again
     - Lines 403-418: Renders staff notation again (**RENDER #2**)

### Root Cause

The initialization sequence has a logic flaw:

```
ui.initialize()
├─ setupTabs() 
│  └─ switchTab('staff-notation')  [RENDER #1]
└─ restoreTabPreference()
   └─ switchTab('staff-notation')  [RENDER #2] <- DUPLICATE!
```

Both `setupTabs()` and `restoreTabPreference()` call `switchTab()`, and when there's no saved tab preference, it falls back to the same tab that was already set.

### Failing Test

**File:** `/home/john/editor/tests/e2e-pw/tests/FAILING-duplicate-staff-notation.spec.js`

Tests verify:
1. Only **1 SVG element** in container (not 2)
2. Notes don't span abnormal vertical height
3. Container height is reasonable (< 250px) for single staff
4. Multi-cycle loads don't accumulate duplicate staffs

---

## Rendering Triggers in Production

### 1. Initial Page Load
- `setupTabs()` → render
- `restoreTabPreference()` → render (if no saved tab)
- Result: **Potential double render**

### 2. Tab Switch to Staff Notation
- `switchTab('staff-notation')` → render
- `updateDocumentDisplay()` → depends on which tab is being updated

### 3. Resize Event
**File:** `/home/john/editor/src/js/main.js` (lines 317-413)

```javascript
setupResizeRedraw() {
  this.resizeHandle.setOnResizeEnd(() => {
    if (activeTabName === 'staff-notation') {
      // Clear cache, reset OSMD instance, call renderStaffNotation()
    }
  });
}
```

### 4. Document Modifications
When text is typed or edited:
- `renderAndUpdate()` is called in editor.js
- Eventually triggers `renderStaffNotation()` based on tab status

---

## Cache Mechanism Details

### IndexedDB Caching (osmd-renderer.js)

```javascript
hashMusicXml(musicxml)           // Creates hash of MusicXML content
getCachedRender(hash)            // Retrieves cached SVG from IndexedDB
setCachedRender(hash, svg)       // Stores rendered SVG
clearCachedRender(hash)          // Clears specific cached render
clearAllCache()                  // Clears all cached renders
```

### Dirty Flag (lastMusicXmlHash)

```javascript
this.lastMusicXmlHash = hash;  // Updated after each render
```

When `hashMusicXml(musicxml) === this.lastMusicXmlHash`, the render is skipped (line 151-154).

### Hash Cache Clear

The hash cache is cleared in two places:

1. **Tab Switch:** `ui.js:407` clears `lastMusicXmlHash` to force re-render
2. **Resize:** `main.js:383` clears `lastMusicXmlHash` to force re-render

---

## Summary: Double-Render Sequence

### Current Behavior (BUGGY)
```
Page Load
├─ main.js: AppFactory.init()
│  └─ editor.initialize()
│  └─ ui.initialize()
│     ├─ setupTabs()
│     │  └─ switchTab('staff-notation')
│     │     └─ renderStaffNotation() ← RENDER #1
│     └─ restoreTabPreference()
│        └─ switchTab('staff-notation') [fallback, no saved tab]
│           └─ renderStaffNotation() ← RENDER #2 (DUPLICATE!)
├─ resizeHandle.initialize()
└─ [other initialization...]
```

### Key Code Locations

| Action | File | Line | Code |
|--------|------|------|------|
| Setup tabs initially | `ui.js` | 279 | `this.switchTab('staff-notation')` |
| Restore saved tab | `ui.js` | 469-479 | `restoreTabPreference()` |
| Render on tab switch | `ui.js` | 418 | `await this.editor.renderStaffNotation()` |
| Clear hash cache | `ui.js` | 407 | `this.editor.osmdRenderer.lastMusicXmlHash = null` |
| Skip unchanged | `osmd-renderer.js` | 151-154 | Hash comparison |

---

## How to Fix

The fix is to prevent double-calling `switchTab()` during initialization:

**Option 1:** Only call switchTab once
- Remove the call in `setupTabs()` (line 279)
- Let `restoreTabPreference()` handle all tab switching

**Option 2:** Guard against duplicate switches
- Track whether we're already on the target tab
- Skip rendering if tab hasn't changed

**Option 3:** Dedup render calls
- Check if a render is already in progress
- Use render token to cancel outdated renders

The codebase already has some of these mechanisms (render token, hash cache), but the initialization sequence is calling `switchTab()` redundantly.

---

## Appendix: File Locations

```
src/js/
├─ main.js                          # App initialization, resize callbacks
├─ editor.js                        # Core editor, renderStaffNotation() entry point
├─ ui.js                            # Tab system, switchTab()
├─ osmd-renderer.js                 # OSMD rendering with caching
├─ managers/
│  └─ ExportManager.js              # renderStaffNotation() implementation
├─ renderer.js                      # DOM renderer for notation lines
└─ [other files...]

tests/e2e-pw/tests/
└─ FAILING-duplicate-staff-notation.spec.js   # Tests detecting the bug

index.html
└─ staff-notation-container div     # Line 633
```

