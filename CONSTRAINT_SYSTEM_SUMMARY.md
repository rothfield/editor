# Musical Constraint System - Implementation Summary

## Overview
A comprehensive scale constraint system that filters available pitches to help composers stay within specific modes, maqams, or ragas.

## Features Implemented

### 1. Scale Library (38 Predefined Constraints)

#### Western Modes (7)
- Ionian (Major)
- Dorian
- Phrygian
- Lydian
- Mixolydian
- Aeolian (Natural Minor)
- Locrian

#### Western/Jazz Scales (3)
- Harmonic Minor
- Jazz Minor (Melodic Minor)
- Phrygian Dominant

#### Maqam (3)
- Maqam Rast (with quarter-tone 3♭̸ and 7♭̸)
- Maqam Bayati (with quarter-tone 2♭̸)
- Maqam Hijaz

#### Thaats - Parent Scales (10)
- Bilawal (Ionian equivalent)
- Kalyan/Yaman (Lydian equivalent)
- Khamaj (Mixolydian equivalent)
- Bhairav (Double Harmonic)
- Purvi (Double Harmonic #4)
- Marwa (Lydian ♭2, omits 5th)
- Kafi (Dorian equivalent)
- Asavari (Aeolian equivalent)
- Bhairavi (Phrygian equivalent)
- Todi (Phrygian #4 #7)

#### Popular Raga (13)
- Bhupali (pentatonic: 1 2 3 5 6)
- Bageshri
- Desh (variable: different ascending/descending)
- Malkauns (pentatonic: 1 ♭3 4 ♭6 ♭7)
- Durga (pentatonic: 1 2 4 5 6)
- Shree (Puriya Dhanashree)
- Jaunpuri
- Multani
- Darbari Kanada
- Kedar (uses both Ma)
- Bihag (uses both Ma)
- Lalit (hexatonic, omits 5th, uses both Ma)
- Miyan ki Todi

### 2. Special Scale Features

**Pentatonic Scales** (5 notes)
- Omit specific scale degrees
- Example: Bhupali omits 4 and 7

**Hexatonic Scales** (6 notes)
- Example: Marwa and Lalit omit the 5th (Pa)

**Variable Scales** (multiple accidentals per degree)
- Example: Kedar uses both natural and sharp Ma
- Example: Desh uses both natural and flat Ni

**Quarter-Tone Support**
- Maqam scales use half-flats (♭̸)
- Example: Maqam Rast has 3♭̸ and 7♭̸

### 3. WASM API Functions

```javascript
// Get all 38 predefined constraints
wasmModule.getPredefinedConstraints()

// Check if specific pitch allowed by constraint
wasmModule.isPitchAllowed(constraintId, pitchCode)

// Set active constraint for document
wasmModule.setActiveConstraint(constraintId)

// Get current active constraint ID
wasmModule.getActiveConstraint()

// Check pitch against document's active constraint
wasmModule.checkPitchAgainstActiveConstraint(pitchCode)
```

### 4. Document Integration

The active constraint is saved with the document:

```json
{
  "title": "My Composition",
  "active_constraint": {
    "id": "dorian",
    "name": "Dorian",
    "category": "WesternMode",
    "degrees": [...]
  },
  "lines": [...]
}
```

### 5. User Interface

**Modal Dialog** (`File → Set Constraints...` or double-click Mode button)
- **Tabbed interface** with Western, Raga, Maqam, and All categories
- **Search box** for filtering scales by name or description
- **Card-based grid layout** with responsive design
- **Visual badges** for special features:
  - 5-note (Pentatonic scales)
  - 6-note (Hexatonic scales)
  - Quarter-Tone (Maqam with half-flats)
  - Variable (scales with multiple accidentals per degree)
- **80% window size** (80vw × 80vh) for better visibility
- Visual selection with checkmarks on cards
- Hover effects and smooth transitions
- "Clear Constraint" button
- "Create Custom..." placeholder (future enhancement)

**Mode Toggle Button** (in header)
- Shows current constraint status: "Mode: None" or constraint name
- **Single click**: Toggle constraint on/off (keeps selection but disables filtering)
- **Double click**: Open constraints dialog
- **Visual states**:
  - Gray (no constraint): "Mode: None"
  - Blue (active): Shows constraint name
  - Yellow with strikethrough (disabled): Shows constraint name but filtering is off
- Automatically updates when document loads or constraint changes

**Keyboard Filtering**
- Real-time checking before pitch insertion
- Visual warning for blocked pitches
- Allows non-pitch characters (spaces, dashes, etc.)

### 6. Usage Examples

**Example 1: Selecting a constraint**
1. Double-click the "Mode: None" button in the header (or use `File → Set Constraints...`)
2. Click the "Western" tab
3. Select "Dorian" card (1 2 ♭3 4 5 6 ♭7)
4. The mode button now shows "Dorian" in blue

**Example 2: Typing with constraints**
Try typing pitches with Dorian active:
- `1` - allowed ✓
- `2` - allowed ✓
- `3` - **BLOCKED** (only ♭3 allowed in Dorian)
- `b3` - allowed ✓ (komal Ga)
- `4` - allowed ✓

**Example 3: Temporarily disabling a constraint**
1. Single-click the "Dorian" button in the header
2. Button turns yellow with strikethrough
3. All pitches are now allowed (constraint is selected but disabled)
4. Click again to re-enable

**Example 4: Changing constraints**
1. Double-click the active constraint button
2. Select a different scale from the dialog
3. The button updates immediately to show the new constraint

## Testing

**Unit Tests** (10 comprehensive tests)
- Pentatonic scales (omitted degrees)
- Ragas with komal (flat) notes
- Ragas with tivra Ma (sharp 4th)
- Variable ragas (multiple accidentals per degree)
- Jazz Minor and Phrygian Dominant
- Quarter-tone maqams

**To Run Tests:**
```bash
cargo test --lib constraints
```

## Files Modified/Created

### Created:
- `src/models/constraints.rs` (1,152 lines)
- `src/css/constraints-dialog.css` (370 lines) - Redesigned with tabs, search, cards
- `src/js/ConstraintsDialog.js` (384 lines) - Redesigned with tab/search support

### Modified:
- `src/models/mod.rs`
- `src/models/pitch_code.rs`
- `src/models/core.rs`
- `src/api/core.rs`
- `src/js/ui.js` - Added mode toggle button functionality
- `src/js/core/WASMBridge.js`
- `src/js/handlers/KeyboardHandler.js` - Updated to check if constraint is enabled
- `src/js/coordinators/InspectorCoordinator.js` - Added mode toggle display update
- `index.html` - Updated modal structure with tabs/search, added mode toggle button

## Future Enhancements (Optional)

1. **Custom Constraint Creation**
   - UI form with 7 dropdowns (one per degree)
   - Each dropdown: None, Natural, Sharp, Flat, Half-Flat, etc.
   - Save to localStorage

2. **localStorage Persistence**
   - Save user-created constraints
   - Load on startup

3. **E2E Tests**
   - Playwright tests for all 38 scales
   - Test constraint filtering behavior

## Architecture Notes

**Constraint Structure:**
```rust
pub struct ScaleConstraint {
    pub id: String,
    pub name: String,
    pub category: ScaleCategory,
    pub degrees: [DegreeConstraint; 7],
    pub description: Option<String>,
    pub is_custom: bool,
}

pub enum DegreeConstraint {
    Any,                           // Allow any accidental
    Only(Vec<AccidentalType>),     // Only allow specific accidentals
    Omit,                          // This degree not in scale
}
```

**Constraint Logic:**
- Simple lookup table approach
- No complex calculations
- Fast O(1) constraint checking
- Scales stored as arrays of allowed accidentals per degree

## References

- Maqam: [maqamworld.com](https://maqamworld.com)
- Raga: Various scholarly sources
- Western Modes: Standard music theory

---

**Status:** ✅ Fully Functional
**Build:** `npm run build-wasm` (completed successfully)
**Usage:** Refresh browser to load new WASM module
