# Composer Field Implementation

## Overview

Added support for document composer metadata with flush-right rendering on the canvas, following the same pattern as the title field.

## Implementation Details

### Rust API (`src/api.rs`)

Added `set_composer` WASM function:
- Function: `set_composer(document_js: JsValue, composer: &str)`
- Sets `document.composer` field
- Follows same pattern as `set_title`

### Document Manager (`src/js/document-manager.js`)

Added `setComposer` method:
- Calls WASM `setComposer` function
- Preserves document state across WASM boundary
- Marks document as dirty

### UI (`src/js/ui.js`)

Added menu item and handler:
- **Menu**: File → Set Composer...
- **Action**: `set-composer`
- Prompts user for composer name
- Updates document and re-renders canvas

### Renderer (`src/js/renderer.js`)

Updated `renderDocumentTitle` method:
- Renders both title and composer in header container
- **Title**: Centered, 20px, bold
- **Composer**: Flush right, 14px, italic, gray color
- 4px gap between title and composer

## Usage

1. **Via Menu**: File → Set Composer...
2. **Enter composer name** in prompt
3. **Composer appears** flush right below title on canvas

## Layout

```
┌─────────────────────────────────────┐
│          Document Title             │
│                  Composer Name →   │
├─────────────────────────────────────┤
│  Musical notation...                │
└─────────────────────────────────────┘
```

## Files Modified

1. `src/api.rs`: Added `set_composer` WASM function
2. `src/js/document-manager.js`: Added `setComposer` method
3. `src/js/ui.js`: Added menu item, action handler, and getter
4. `src/js/renderer.js`: Updated header rendering

## Build

Rebuild WASM after changes:
```bash
wasm-pack build --target web --out-dir src/wasm
```
