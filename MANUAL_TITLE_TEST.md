# Manual Test: Title "abcde" Display

## Quick Test in Browser

1. **Start the dev server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Open browser** to http://localhost:8080

3. **Open browser console** (F12)

4. **Set title to "abcde"**:
   ```javascript
   const app = window.MusicNotationApp?.app();
   app.editor.theDocument.title = 'abcde';
   app.editor.render();
   ```

5. **Type some musical content**:
   - Click in the editor
   - Type: `S r g m P d n S'`

6. **Verify title appears**:
   - Look for "abcde" centered above the musical notation
   - Should be bold, dark gray text
   - Should be larger than any composer text

## What You Should See

```
           abcde                    ← Title (centered, bold)

S r g m | P d n S'                 ← Musical content
```

## Testing with Composer Too

```javascript
app.editor.theDocument.title = 'abcde';
app.editor.theDocument.composer = 'Test Composer';
app.editor.render();
```

Should show:
```
           abcde                    ← Title (centered, bold)
                    Test Composer  ← Composer (right, italic)

S r g m | P d n S'                 ← Musical content
```

## Inspect Element

Right-click the title and "Inspect":
- Element class: `document-title`
- Has attribute: `data-testid="document-title"`
- Parent container: `document-header`
- Styles: center-aligned, bold, color #1f2937

## Test Edge Cases

### "Untitled Document" should NOT show:
```javascript
app.editor.theDocument.title = 'Untitled Document';
app.editor.render();
// → No title should appear
```

### Empty title should NOT show:
```javascript
app.editor.theDocument.title = '';
app.editor.render();
// → No header at all (unless composer exists)
```

### Dynamic update works:
```javascript
app.editor.theDocument.title = 'First Title';
app.editor.render();
// → Shows "First Title"

app.editor.theDocument.title = 'Second Title';
app.editor.render();
// → Updates to "Second Title"
```

## Automated Test

To run the full automated test suite:
```bash
npx playwright test tests/e2e-pw/tests/document-title-rendering.spec.js --project=chromium
```

All 7 tests should pass ✅
