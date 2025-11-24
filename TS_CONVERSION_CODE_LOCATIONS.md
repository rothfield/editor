# TypeScript Conversion - Specific Code Locations

## Critical Location 1: CursorCoordinator.ts Line 235

### Current Code (UNSAFE)
```typescript
// File: src/js/coordinators/CursorCoordinator.ts
// Lines 234-238

startCursorBlinking(): void {
  // ...
  this._blinkInterval = setInterval(() => {
    if (this.editor.eventManager && !this.editor.eventManager.editorFocus()) {  // LINE 235
      this.stopCursorBlinking();
    }
  }, 100);
}
```

### Problem
1. `this.editor.eventManager` is **undefined** - property doesn't exist in editor.ts
2. Even if it existed, `editorFocus()` method is not in any TypeScript interface
3. TypeScript compiler should error: "Property 'eventManager' does not exist"

### Solution
```typescript
// Add to editor.ts class definition (around line 67):
eventManager?: EventManager | null;

// Add interface in editor.ts or types/events.ts:
interface EventManager {
  editorFocus(): boolean;
}

// Update CursorCoordinator.ts import:
import type { EventManager } from '../events';
```

---

## Critical Location 2: CursorCoordinator.ts Line 307

### Current Code (UNSAFE)
```typescript
// File: src/js/coordinators/CursorCoordinator.ts
// Lines 306-311

// Update cursor appearance based on state
if (this.editor.eventManager && this.editor.eventManager.editorFocus()) {  // LINE 307
  cursor.classList.add('focused');
} else {
  cursor.classList.remove('focused');
}
```

### Problem
Same as Location 1 - `eventManager` property and `editorFocus()` method are untyped

### Solution
Same as Location 1

---

## Critical Location 3: editor.ts Line 1227

### Current Code (UNSAFE)
```typescript
// File: src/js/editor.ts
// Lines 1225-1235

try {
  // Toggle the mode in WASM
  this.wasmModule.toggleOrnamentEditMode();  // LINE 1227 - METHOD NOT IN TYPES!

  // Update local state
  this.ornamentEditMode = !this.ornamentEditMode;
  // ...
}
```

### Problem
The method `toggleOrnamentEditMode()` exists in the actual WASM module but is **NOT defined in the WASMModule interface**. TypeScript should error: "Property 'toggleOrnamentEditMode' does not exist on type 'WASMModule'"

### Solution
Add to `src/types/wasm-module.ts` in the `WASMModule` interface:

```typescript
// File: src/types/wasm-module.ts
// Add to WASMModule interface (around line 330-340):

/**
 * Toggle ornament edit mode on/off
 */
toggleOrnamentEditMode(): void;
```

---

## Critical Location 4: editor.ts Lines 1239-1240

### Current Code (UNSAFE)
```typescript
// File: src/js/editor.ts
// Lines 1237-1242

if (this.ui) {
  this.ui.setupOrnamentMenu();           // LINE 1239 - METHOD NOT IN UI INTERFACE
  this.ui.updateModeToggleDisplay();     // LINE 1240 - METHOD NOT IN UI INTERFACE
}
```

### Current UI Interface (Lines 51-56)
```typescript
interface UI {
  isInitialized?: boolean;
  activeTab?: string;
  updateDocumentTitle(title: string): void;
  updateCurrentPitchSystemDisplay(): void;
}
```

### Problem
- `setupOrnamentMenu()` is called but not defined in interface
- `updateModeToggleDisplay()` is called but not defined in interface
- TypeScript should error: "Property 'setupOrnamentMenu' does not exist on type 'UI'"

### Solution
Extend the UI interface in `src/js/editor.ts`:

```typescript
interface UI {
  isInitialized?: boolean;
  activeTab?: string;
  updateDocumentTitle(title: string): void;
  updateCurrentPitchSystemDisplay(): void;
  setupOrnamentMenu(): void;                // ADD THIS
  updateModeToggleDisplay(): void;          // ADD THIS
}
```

Or create a more comprehensive interface in `src/types/ui.ts`:
```typescript
export interface IUI {
  isInitialized?: boolean;
  activeTab?: string;
  updateDocumentTitle(title: string): void;
  updateCurrentPitchSystemDisplay(): void;
  setupOrnamentMenu(): void;
  updateModeToggleDisplay(): void;
  updateKeySignatureDisplay(): void;
  restoreTabPreference(): void;
  // ... other UI methods
}
```

---

## Missing Property: eventManager in editor.ts

### Current Class Definition (Lines 58-98)
```typescript
class MusicNotationEditor {
  // Core elements
  element: HTMLElement;
  wasmModule: WASMBridge | null;
  renderer: DOMRenderer | null;
  osmdRenderer: OSMDRenderer | null = null;
  eventHandlers: Map<string, EventListener>;
  isInitialized: boolean;

  // UI reference (set externally)
  ui?: UI;

  // Staff notation real-time update
  staffNotationTimer: number | null;

  // Mouse selection state
  isDragging: boolean;
  dragStartPos: Pos | null;
  dragEndPos: Pos | null;
  justDragSelected: boolean;

  // Clipboard storage (for rich copy/paste)
  clipboard: ClipboardData;

  // Managers and services
  autoSave: AutoSave;
  storage: StorageManager;
  debugHUD: DebugHUD;
  keyboardHandler: KeyboardHandler;
  mouseHandler: MouseHandler;
  exportManager: ExportManager;

  // Coordinators (specialized functionality extraction)
  cursorCoordinator: CursorCoordinator;
  selectionCoordinator: SelectionCoordinator;
  clipboardCoordinator: ClipboardCoordinator;
  inspectorCoordinator: InspectorCoordinator;
  renderCoordinator: RenderCoordinator;
  consoleCoordinator: ConsoleCoordinator;
  musicalCoordinator: MusicalCoordinator;

  // Ornament Edit Mode state
  ornamentEditMode: boolean = false;

  // MISSING: eventManager property!
}
```

### Problem
`eventManager` is used in `CursorCoordinator.ts` but never declared

### Solution
Add after `ui?: UI;` (around line 68):

```typescript
// Event manager (set by application initialization)
eventManager?: EventManager | null;
```

---

## File with Import Extension Issues

### Current (WRONG - Uses .js for .ts files)
```typescript
// File: src/js/editor.ts
// Lines 8, 16, 22

import DOMRenderer from './renderer.js';                          // .js file
import WASMBridge from './core/WASMBridge.js';                   // Should be .ts!
import KeyboardHandler from './handlers/KeyboardHandler.js';     // .js file
import MouseHandler from './handlers/MouseHandler.js';           // .js file
import ExportManager from './managers/ExportManager.js';         // .js file

// Coordinators
import CursorCoordinator from './coordinators/CursorCoordinator.js';       // Should be .ts!
import SelectionCoordinator from './coordinators/SelectionCoordinator.js'; // .js file
import ClipboardCoordinator from './coordinators/ClipboardCoordinator.js'; // .js file
import InspectorCoordinator from './coordinators/InspectorCoordinator.js'; // .js file
import RenderCoordinator from './coordinators/RenderCoordinator.js';       // .js file
import ConsoleCoordinator from './coordinators/ConsoleCoordinator.js';     // .js file
import MusicalCoordinator from './coordinators/MusicalCoordinator.js';     // .js file
```

### Solution (CORRECT - Use proper extensions)
```typescript
import DOMRenderer from './renderer.js';                          // .js file (to convert)
import WASMBridge from './core/WASMBridge.ts';                   // .ts file - USE .ts!
import KeyboardHandler from './handlers/KeyboardHandler.js';     // .js file (to convert)
import MouseHandler from './handlers/MouseHandler.js';           // .js file (to convert)
import ExportManager from './managers/ExportManager.js';         // .js file (to convert)

// Coordinators
import CursorCoordinator from './coordinators/CursorCoordinator.ts';       // .ts file - USE .ts!
import SelectionCoordinator from './coordinators/SelectionCoordinator.ts'; // .ts file (after conversion)
import ClipboardCoordinator from './coordinators/ClipboardCoordinator.ts'; // .ts file (after conversion)
import InspectorCoordinator from './coordinators/InspectorCoordinator.ts'; // .ts file (after conversion)
import RenderCoordinator from './coordinators/RenderCoordinator.ts';       // .ts file (after conversion)
import ConsoleCoordinator from './coordinators/ConsoleCoordinator.ts';     // .ts file (after conversion)
import MusicalCoordinator from './coordinators/MusicalCoordinator.ts';     // .ts file (after conversion)
```

---

## CursorCoordinator.ts Type Import Issues

### Current (WRONG)
```typescript
// File: src/js/coordinators/CursorCoordinator.ts
// Line 20

import type Editor from '../editor.js';
```

### Problem
1. `editor.ts` is not exported with a default type called `Editor`
2. The actual class is `MusicNotationEditor`
3. Should use `type` import syntax correctly

### Solution
```typescript
import type MusicNotationEditor from '../editor.js';

// Then in the class:
private editor: MusicNotationEditor;

// OR better - import the class type:
import type { MusicNotationEditor } from '../editor';
```

---

## EventManager Interface (Needs Creation)

### Current (events.js - NO TYPES)
```javascript
// File: src/js/events.js
// Lines 1-35

class EventManager {
  constructor(editor, fileOperations = null) {
    this.editor = editor;
    this.fileOperations = fileOperations;
    this.eventListeners = new Map();
    this.focusState = {
      hasFocus: false,
      activeElement: null,
      lastFocusTime: 0
    };
    // ...
  }

  // Key methods (examples):
  attachEarlyKeyboardListeners() { ... }
  initialize() { ... }
  editorFocus() { ... }  // LINE 608
  // ... ~750 LOC total
}
```

### Solution
Create `src/types/events.ts`:
```typescript
/**
 * Event Manager interface
 * Extracted from src/js/events.js
 */

export interface IEventManager {
  // Focus management
  editorFocus(): boolean;
  
  // Initialization
  attachEarlyKeyboardListeners(): void;
  initialize(): void;
  setupGlobalListeners(): void;
  setupFocusManagement(): void;
  setupKeyboardShortcuts(): void;
  
  // Event handling
  addEventListener(event: string, handler: EventListener): void;
  removeEventListener(event: string, handler: EventListener): void;
  
  // Additional methods...
}

export type EventManager = IEventManager;
```

Then update editor.ts:
```typescript
import type { EventManager } from '../types/events';

class MusicNotationEditor {
  eventManager?: EventManager | null;
  // ...
}
```

---

## Summary: All Quick Fixes

These 4 changes take ~15 minutes and fix all critical type errors:

### 1. editor.ts - Add property (line ~68)
```typescript
eventManager?: EventManager | null;
```

### 2. editor.ts - Extend UI interface (lines 51-56)
```typescript
interface UI {
  isInitialized?: boolean;
  activeTab?: string;
  updateDocumentTitle(title: string): void;
  updateCurrentPitchSystemDisplay(): void;
  setupOrnamentMenu(): void;           // ADD
  updateModeToggleDisplay(): void;     // ADD
}
```

### 3. wasm-module.ts - Add method to interface
```typescript
/**
 * Toggle ornament edit mode on/off
 */
toggleOrnamentEditMode(): void;
```

### 4. Create types/events.ts with EventManager interface
```typescript
export interface IEventManager {
  editorFocus(): boolean;
  // ... other methods
}
```

