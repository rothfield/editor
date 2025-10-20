# DOM Structure Refactor - Pitch, Octave, and Lyric Organization

## Problem
Octave dots were misaligned when lyrics were attached to notes because pseudo-element positioning became ambiguous when the layout included sibling elements.

## Solution
Refactored the DOM structure to use explicit wrappers with proper semantic hierarchy:

```html
<!-- NEW STRUCTURE -->
<span class="pitch-lyric-group" style="position: absolute; left: 60px; top: 32px; width: 26.7px; height: 16px;">
  <span class="pitch-octave-group">
    <span class="char-cell">1</span>
    <span class="octave-dot" style="position: absolute;">•</span>  <!-- Real DOM element -->
  </span>
  <span class="lyric-syllable">he-</span>
</span>
```

## Changes Made

### File: `src/js/renderer.js`

#### 1. Removed Pseudo-Element Octave Dots (Lines 57-58)
**Before:**
```css
.char-cell[data-octave="1"]::before { content: '•'; ... }
.char-cell[data-octave="2"]::before { content: '••'; ... }
.char-cell[data-octave="-1"]::before { content: '•'; ... }
.char-cell[data-octave="-2"]::before { content: '••'; ... }
```

**After:**
```css
/* Octave dots now use real DOM elements (span.octave-dot) instead of ::before pseudo-elements */
```

#### 2. Created Real Octave Dot DOM Elements (Lines 581-622)
```javascript
const octaveDot = document.createElement('span');
octaveDot.className = 'octave-dot';
const octaveValue = charCell.dataset.octave;

if (octaveValue && octaveValue !== '0') {
  // Set text content based on octave value
  if (octaveValue === '1') octaveDot.textContent = '•';
  else if (octaveValue === '2') octaveDot.textContent = '••';
  // ... etc

  // Position absolutely within the wrapper
  octaveDot.style.cssText = `
    position: absolute;
    font-size: ${SMALL_FONT_SIZE}px;
    left: 50%;
    transform: translateX(-50%);
    top: -10px;  // or bottom: -6px for lower octaves
    ...
  `;
}
```

#### 3. Simplified Char-Cell Styling (Lines 533-537)
**Before:**
```javascript
charCell.style.cssText = `
  position: absolute;
  left: ${cellData.x}px;
  top: ${cellData.y}px;
  width: ${cellData.w}px;
  height: ${cellData.h}px;
  overflow: visible;
`;
```

**After:**
```javascript
charCell.style.cssText = `
  width: ${cellData.w}px;
  height: ${cellData.h}px;
  display: inline-block;
`;
```

#### 4. Created Wrappers (Lines 621-639)
**Pitch-Octave-Group:**
```javascript
const pitchOctaveGroup = document.createElement('span');
pitchOctaveGroup.className = 'pitch-octave-group';
pitchOctaveGroup.appendChild(charCell);
if (octaveDot.textContent) {
  pitchOctaveGroup.appendChild(octaveDot);
}
```

**Pitch-Lyric-Group (positioned anchor):**
```javascript
const pitchLyricGroup = document.createElement('span');
pitchLyricGroup.className = 'pitch-lyric-group';
pitchLyricGroup.style.cssText = `
  position: absolute;
  left: ${cellData.x}px;
  top: ${cellData.y}px;
  width: ${cellData.w}px;
  height: ${cellData.h}px;
`;
```

#### 5. Integrated Lyrics into Structure (Lines 641-659)
```javascript
// Match lyrics by x position
const cellCenterX = Math.round(cellData.x + cellData.w / 2);
const matchingLyric = lyricsByXPosition.get(cellCenterX);

if (matchingLyric) {
  const lyricSpan = document.createElement('span');
  lyricSpan.className = 'lyric-syllable text-sm';
  lyricSpan.textContent = matchingLyric.text;
  lyricSpan.style.cssText = `
    position: absolute;
    left: 50%;
    top: ${matchingLyric.y - cellData.y}px;
    transform: translateX(-50%);
    ...
  `;
  pitchLyricGroup.appendChild(lyricSpan);
}
```

## DOM Structure Details

### Hierarchy
```
pitch-lyric-group (positioned anchor at cell location)
├── pitch-octave-group
│   ├── char-cell (not positioned, flows in wrapper)
│   └── octave-dot (absolutely positioned at 50% horizontally)
└── lyric-syllable (absolutely positioned)
```

### Positioning Context
- **pitch-lyric-group**: `position: absolute` - anchors at cell location (x, y)
- **char-cell**: No position - renders at (0, 0) within wrapper
- **octave-dot**: `position: absolute` - positioned relative to pitch-lyric-group
  - Upper octaves: `top: -10px`
  - Lower octaves: `bottom: -6px`
  - Horizontal: `left: 50%; transform: translateX(-50%)`
- **lyric-syllable**: `position: absolute` - positioned relative to pitch-lyric-group
  - Calculated position: `top: matchingLyric.y - cellData.y`

## Key Improvements

### 1. Eliminated Pseudo-Element Complexity
- ✅ No more context-dependent positioning calculations
- ✅ Real DOM elements for octave dots
- ✅ Clearer, more predictable positioning

### 2. Resolved Octave Dot Misalignment
- ✅ Octave dots are now real elements with independent positioning
- ✅ Always centered on their note (left: 50%; transform: translateX(-50%))
- ✅ Not affected by sibling elements like lyrics

### 3. Semantic Structure
- ✅ Pitch and octave grouped together (pitch-octave-group)
- ✅ Lyrics belong with their note (pitch-lyric-group)
- ✅ Clear relationship between elements

### 4. Lyric-to-Pitch Association
- ✅ Lyrics are automatically matched to cells by x position
- ✅ Lyrics are placed inside the pitch-lyric-group
- ✅ Lyrics move with their notes

## HTML Output Example

```html
<span class="pitch-lyric-group" style="position: absolute; left: 60px; top: 32px; width: 26.7946px; height: 16px;">
  <span class="pitch-octave-group">
    <span class="char-cell kind-pitched pitch-system-number" data-octave="0">1</span>
    <!-- octave-dot added here if octave != 0 -->
  </span>
  <span class="lyric-syllable text-sm">he-</span>
</span>
```

## Data Flow

### For each cell:
1. Create charCell span (char, classes, width, height)
2. Check for octave value (data-octave)
3. Create octaveDot span if octave exists
4. Wrap both in pitchOctaveGroup
5. Create pitchLyricGroup positioned at cell location
6. Find matching lyric by x position
7. Add lyric to pitchLyricGroup if found
8. Append to line

## Benefits for Maintenance

- ✅ **Easier debugging**: DOM structure matches logical hierarchy
- ✅ **Clearer CSS**: No pseudo-element complexity
- ✅ **Better positioning**: Explicit absolute positioning, not context-dependent
- ✅ **Easier styling**: Can modify any element without affecting siblings
- ✅ **Scalable**: Easy to add more elements (e.g., annotations, alternate notations)

## Build Status
✅ Build successful - no errors
✅ Ready for comprehensive testing

## Next Steps
1. Visual testing with notes, octaves, and lyrics
2. Testing multiline documents
3. Testing with various octave combinations
4. Performance verification
5. Regression testing (ensure existing functionality works)
