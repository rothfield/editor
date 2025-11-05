# JavaScript UI API Contract: Ornament Operations

**Feature**: 006-music-notation-ornament
**Files**: `src/js/editor.js`, `src/js/ui.js`

## API Functions

### applyOrnament(positionType)

**Purpose**: Apply ornament styling to current selection

**Signature**:
```javascript
async applyOrnament(positionType = 'after'): Promise<void>
```

**Parameters**:
- `positionType`: String - One of `'before'`, `'after'`, or `'top'`

**Behavior**:
1. Get current selection (`this.selectionStart`, `this.selectionEnd`)
2. Call WASM: `wasmModule.apply_ornament(cells, start, end, positionType)`
3. Update `this.cells` with returned cells
4. Call `this.render()` to update display

**Error Handling**:
- No selection: No-op, log warning
- Invalid position type: Default to `'after'`, log warning

**Example**:
```javascript
editor.setSelection(0, 2);  // Select cells 0-2
await editor.applyOrnament('before');  // Apply ornament
```

---

### removeOrnament()

**Purpose**: Remove ornament styling from current selection

**Signature**:
```javascript
async removeOrnament(): Promise<void>
```

**Behavior**:
1. Get current selection
2. Call WASM: `wasmModule.remove_ornament(cells, start, end)`
3. Update `this.cells` with returned cells
4. Call `this.render()`

**Example**:
```javascript
editor.setSelection(1, 3);  // Select ornamental cells
await editor.removeOrnament();  // Remove styling
```

---

### toggleOrnamentEditMode()

**Purpose**: Toggle between normal mode (floating ornaments) and edit mode (inline ornaments)

**Signature**:
```javascript
toggleOrnamentEditMode(): void
```

**Behavior**:
1. Toggle `this.ornamentEditMode` boolean
2. Call `this.render()` (pass edit mode state to renderer)
3. Update UI button state/label

**State**:
- `this.ornamentEditMode`: Boolean
  - `false` (default): Normal mode, ornaments float
  - `true`: Edit mode, ornaments inline

**Example**:
```javascript
editor.ornamentEditMode;  // false
editor.toggleOrnamentEditMode();
editor.ornamentEditMode;  // true
editor.toggleOrnamentEditMode();
editor.ornamentEditMode;  // false
```

---

## Menu Integration

**File**: `src/js/ui.js`

**Menu Items**:
```javascript
{
  id: 'menu-apply-ornament',
  label: 'Ornament (Alt+0)',
  action: 'apply-ornament-after'
},
{
  id: 'menu-apply-ornament-before',
  label: 'Ornament Before',
  action: 'apply-ornament-before'
},
{
  id: 'menu-apply-ornament-top',
  label: 'Ornament Top',
  action: 'apply-ornament-top'
},
{
  id: 'menu-toggle-ornament-edit',
  label: 'Toggle Ornament Edit Mode (Alt+Shift+O)',
  action: 'toggle-ornament-edit'
}
```

**Action Handlers**:
```javascript
handleMenuAction(action) {
  switch (action) {
    case 'apply-ornament-after':
      this.editor.applyOrnament('after');
      break;
    case 'apply-ornament-before':
      this.editor.applyOrnament('before');
      break;
    case 'apply-ornament-top':
      this.editor.applyOrnament('top');
      break;
    case 'toggle-ornament-edit':
      this.editor.toggleOrnamentEditMode();
      break;
  }
}
```

---

## Keyboard Shortcuts

**File**: `src/js/events.js`

**Shortcuts**:
- `Alt+0`: Apply ornament (after, default)
- `Alt+Shift+O`: Toggle ornament edit mode

**Implementation**:
```javascript
handleKeyDown(event) {
  if (event.altKey && event.key === '0' && !event.shiftKey) {
    event.preventDefault();
    this.editor.applyOrnament('after');
    return;
  }

  if (event.altKey && event.shiftKey && event.key.toUpperCase() === 'O') {
    event.preventDefault();
    this.editor.toggleOrnamentEditMode();
    return;
  }

  // ... existing shortcuts ...
}
```

---

## State Management

**Editor State**:
```javascript
class Editor {
  constructor() {
    this.ornamentEditMode = false;  // NEW: Edit mode state
    // ... existing state ...
  }
}
```

**State Persistence**: `ornamentEditMode` is session state only (not saved to file)

---

## Testing Contract

**E2E Test Requirements**:

1. **Selection + Apply**: Type cells → Select → Apply ornament → Verify indicators set
2. **Visual Rendering**: Verify ornamental cells have correct CSS (size, color, position)
3. **Edit Mode Toggle**: Toggle mode → Verify layout changes → Toggle again → Verify return
4. **Remove**: Apply ornament → Select → Remove → Verify indicators cleared
5. **Keyboard Shortcuts**: Press Alt+0 → Verify ornament applied, Press Alt+Shift+O → Verify toggle

**Test Data Attributes**:
- Menu items: `data-testid="menu-apply-ornament"`
- Ornament cells: `data-testid="ornament-cell"`
- Edit mode button: `data-testid="btn-toggle-ornament-edit"`

---

## Performance Requirements

- Apply ornament: < 50ms (including WASM call + render)
- Toggle edit mode: < 2s for 1000 cells
- Remove ornament: < 50ms

---

## Error Scenarios

| Scenario | Behavior |
|----------|----------|
| No selection | Log warning, no-op |
| Invalid position type | Default to 'after', log warning |
| WASM call fails | Log error, don't update cells, show user error message |
| Ornament already applied | Toggle off (remove), log info |

---

## Next Steps

1. ✅ UI API contract defined
2. ⏳ Define WASM API contract
3. ⏳ Generate quickstart examples
