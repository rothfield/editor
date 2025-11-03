# Title Rendering Bug - Test Documentation

## Summary
Document titles are present in the data model and WASM layout engine, but are **not rendered** in the visual DOM.

## Test File
`tests/e2e-pw/tests/document-title-rendering.spec.js`

## Test Results
```
✘ 5 tests FAIL - Title not appearing in DOM
✓ 2 tests PASS - "Untitled Document" and empty titles correctly don't render
```

## Root Cause
**File:** `src/js/renderer.js:491`
**Code:**
```javascript
// Title display disabled - only show composer if present
```

The `renderHeaderFromDisplayList()` method creates a `.document-header` container but never adds a `.document-title` element, even when `header.title` is present.

## Data Flow (Verified by Tests)

### ✅ WORKING: Data Layers
1. **Document Model** → Title stored correctly in `document.title`
2. **WASM Display List** → Header includes title in `displayList.header.title`
3. **JavaScript Renderer** → Receives title in `renderHeaderFromDisplayList(header)`

### ❌ BROKEN: Visual Layer
4. **DOM Rendering** → Title is never created as a DOM element

## Composer Field (For Comparison)
The composer field **does** render correctly:
- Creates `.document-composer` element
- Styled with font-size, italic, right-aligned
- Positioned in `.document-header` container

## Expected Behavior
When a user sets `document.title = "My Composition"`:
1. Title should appear centered above the musical content
2. Title should be styled prominently (larger than composer)
3. Title should be positioned in `.document-header` container
4. "Untitled Document" should NOT render (filter it out)

## Test Cases Covered

### Failing Tests (Expected):
1. **Basic title rendering** - Title with musical content
2. **Title + Composer together** - Both should render (only composer works now)
3. **Title updates** - Changing title should re-render
4. **Title positioning** - Should be above notation lines
5. **Title centering** - Should be horizontally centered

### Passing Tests (Working as Intended):
1. **"Untitled Document" filtering** - Correctly hidden
2. **Empty title** - No header renders when both title and composer are empty

## How to Run Tests
```bash
# Run the title rendering test suite
npx playwright test tests/e2e-pw/tests/document-title-rendering.spec.js --project=chromium

# Run just the first test
npx playwright test tests/e2e-pw/tests/document-title-rendering.spec.js:21 --project=chromium
```

## Inspector Verification
The tests use the inspector-first approach (per CLAUDE.md):
1. Check Document Model tab - title is present ✓
2. Check Display List tab - title is in WASM output ✓
3. Check DOM - title element is missing ✗

## Implementation Hints

### Add title rendering in `src/js/renderer.js`
Around line 491, replace the comment with:

```javascript
// Render title (centered)
if (title && title !== 'Untitled Document') {
  const titleElement = document.createElement('div');
  titleElement.className = 'document-title';
  titleElement.textContent = title;
  titleElement.style.cssText = `
    text-align: center;
    font-size: ${BASE_FONT_SIZE * 0.8}px;
    font-weight: bold;
    color: #1f2937;
    width: 100%;
    margin-bottom: 8px;
  `;
  headerContainer.appendChild(titleElement);
}
```

### Consider adding `data-testid`
For more stable tests, add `data-testid="document-title"` to the element.

## Related Files
- `src/models/core.rs` - Document struct with `title` field
- `src/html_layout/document.rs` - Populates DisplayList header
- `src/html_layout/display_list.rs` - DocumentHeader struct definition
- `src/js/renderer.js` - DOM rendering (where fix is needed)
- `tests/title_test.rs` - Rust unit tests for MusicXML/LilyPond export
