# Music Notation Editor - JavaScript Modules

## Quick Reference

This directory contains the refactored JavaScript modules for the Music Notation Editor.

## 📦 New Refactored Modules

### Core Infrastructure

#### constants.js
- **Purpose**: Centralized configuration and constants
- **Exports**: All configuration values, enums, patterns
- **Dependencies**: None
- **Usage**: `import { PITCH_SYSTEMS, DEFAULT_DOCUMENT } from './constants.js'`

#### wasm-integration.js
- **Purpose**: WASM module loading and API interface
- **Exports**: `wasmIntegration` (singleton)
- **Dependencies**: logger.js
- **Usage**: `import wasmIntegration from './wasm-integration.js'`

#### performance-monitor.js
- **Purpose**: Performance tracking and metrics
- **Exports**: `performanceMonitor` (singleton)
- **Dependencies**: constants.js, logger.js
- **Usage**: `import performanceMonitor from './performance-monitor.js'`

### Document Management

#### document-manager.js
- **Purpose**: Document CRUD operations
- **Exports**: `DocumentManager` class
- **Dependencies**: constants.js, logger.js, wasm-integration.js
- **Usage**: `import DocumentManager from './document-manager.js'`

#### cursor-manager.js
- **Purpose**: Cursor positioning and rendering
- **Exports**: `CursorManager` class
- **Dependencies**: constants.js, logger.js
- **Usage**: `import CursorManager from './cursor-manager.js'`

#### text-input-handler.js
- **Purpose**: Text input and parsing
- **Exports**: `TextInputHandler` class
- **Dependencies**: constants.js, logger.js
- **Usage**: `import TextInputHandler from './text-input-handler.js'`

### UI Components

#### menu-system.js
- **Purpose**: Menu creation and interaction
- **Exports**: `MenuSystem` class
- **Dependencies**: constants.js
- **Usage**: `import MenuSystem from './menu-system.js'`

#### textarea-renderer.js
- **Purpose**: Textarea-based notation rendering (one textarea per line)
- **Exports**: `TextareaRenderer` class
- **Dependencies**: mirror-div-service.js
- **Usage**: `import TextareaRenderer from './textarea-renderer.js'`

#### keyboard-handler.js
- **Purpose**: Keyboard input handling
- **Exports**: `KeyboardHandler` class
- **Dependencies**: constants.js, logger.js
- **Usage**: `import KeyboardHandler from './keyboard-handler.js'`

## 🗂️ Original Files (To Be Updated)

### logger.js
- Structured logging with categories
- Log levels: ERROR, WARN, INFO, DEBUG, TRACE
- Performance timing utilities

### main.js
- Application entry point
- Initializes all components
- Sets up global error handlers

### editor.js
- Core editor functionality
- **Status**: Needs refactoring to use new modules
- **Size**: 2,886 lines → target ~500 lines

### ui.js
- UI coordination
- **Status**: Partially refactored (menu-system extracted)
- **Size**: 931 lines → target ~531 lines

### renderer.js
- Rendering coordination
- **Status**: Partially refactored (cell-renderer extracted)
- **Size**: 1,061 lines → target ~781 lines

### events.js
- Event management
- **Status**: Partially refactored (keyboard-handler extracted)
- **Size**: 591 lines → target ~341 lines

### debug.js
- Debug panel and tools
- **Status**: Needs further splitting
- **Size**: 876 lines → target ~576 lines

### file-ops.js
- File operations (open, save, export)
- **Status**: Well-structured, minimal changes needed
- **Size**: 593 lines

### dev-server.js
- Development server with hot reload
- **Status**: Clean architecture, no changes needed
- **Size**: 341 lines

### resize-handle.js
- Debug panel resizing
- **Status**: Simple and clean, no changes needed
- **Size**: 105 lines

## 🔗 Module Relationships

```
constants.js (base layer)
    ↓
logger.js
    ↓
wasm-integration.js
    ↓
┌───────────────┬──────────────────┬──────────────────┐
│               │                  │                  │
performance-  cursor-manager  document-manager  text-input-handler
monitor         │                  │                  │
                └──────────────────┴──────────────────┘
                            ↓
                ┌───────────┼───────────┐
                │           │           │
            textarea-  menu-       keyboard-
            renderer   system      handler
                │           │           │
                └───────────┼───────────┘
                            ↓
                        editor.js
                            ↓
                ┌───────────┼───────────┐
                │           │           │
            ui.js    renderer.js   events.js
```

## 🚀 Quick Start

### Basic Usage

```javascript
// 1. Initialize WASM
import wasmIntegration from './wasm-integration.js';
await wasmIntegration.initialize();

// 2. Create document
import DocumentManager from './document-manager.js';
const docManager = new DocumentManager(wasmIntegration.getModule());
const document = docManager.createNew();

// 3. Setup cursor
import CursorManager from './cursor-manager.js';
const cursor = new CursorManager(document);
cursor.initialize(container);

// 4. Setup text input
import TextInputHandler from './text-input-handler.js';
const textHandler = new TextInputHandler(wasmIntegration.getModule(), document);

// 5. Insert text
const result = textHandler.insertText('1234567', 0);
cursor.setPosition(result.newCursorPos);
```

### Complete Editor Setup

```javascript
import wasmIntegration from './wasm-integration.js';
import performanceMonitor from './performance-monitor.js';
import DocumentManager from './document-manager.js';
import CursorManager from './cursor-manager.js';
import TextInputHandler from './text-input-handler.js';
import MenuSystem from './menu-system.js';
import KeyboardHandler from './keyboard-handler.js';
import TextareaRenderer from './textarea-renderer.js';
import { PITCH_SYSTEMS } from './constants.js';

class MusicEditor {
  async initialize(canvasElement) {
    // 1. Initialize WASM
    await wasmIntegration.initialize();
    this.wasm = wasmIntegration.getModule();

    // 2. Start performance monitoring
    performanceMonitor.start();

    // 3. Create document manager
    this.docManager = new DocumentManager(this.wasm);
    this.document = this.docManager.createNew();

    // 4. Setup cursor
    this.cursor = new CursorManager(this.document);
    this.cursor.initialize(canvasElement);

    // 5. Setup text handler
    this.textHandler = new TextInputHandler(this.wasm, this.document);
    this.textHandler.setPitchSystem(PITCH_SYSTEMS.NUMBER);

    // 6. Setup UI
    this.menuSystem = new MenuSystem(this);
    this.menuSystem.initialize();

    // 7. Setup keyboard
    this.keyboard = new KeyboardHandler(this);
    this.keyboard.initialize();

    // 8. Setup renderer (textarea-based)
    this.textareaRenderer = new TextareaRenderer(canvasElement, this);
  }

  // Methods that use the modules
  insertText(text) {
    const pos = this.cursor.getPosition();
    const result = this.textHandler.insertText(text, pos.column);
    this.cursor.setPosition(result.newCursorPos);
    this.render();
  }

  render() {
    // Get display list from WASM and render via TextareaRenderer
    const displayList = this.wasm.getTextareaDisplayList();
    this.textareaRenderer.renderAll(displayList);
  }
}
```

## 📊 Module Statistics

| Module | Lines | Complexity | Dependencies |
|--------|-------|-----------|--------------|
| constants.js | 387 | Low | 0 |
| wasm-integration.js | 297 | Medium | 1 |
| performance-monitor.js | 365 | Medium | 2 |
| cursor-manager.js | 259 | Low | 2 |
| document-manager.js | 373 | Medium | 3 |
| text-input-handler.js | 333 | Medium | 2 |
| menu-system.js | 334 | Low | 1 |
| textarea-renderer.js | 550 | Medium | 1 |
| keyboard-handler.js | 252 | Medium | 2 |

**Total**: 2,882 lines across 9 modules

## 🧪 Testing

Each module should have corresponding test files:

```
src/js/
├── constants.js
├── constants.test.js           ← Add this
├── wasm-integration.js
├── wasm-integration.test.js    ← Add this
├── performance-monitor.js
├── performance-monitor.test.js ← Add this
├── cursor-manager.js
├── cursor-manager.test.js      ← Add this
└── ... (etc)
```

## 📚 Documentation

- **REFACTORING_COMPLETE.md** - Complete refactoring report
- **REFACTORING_SUMMARY.md** - Detailed analysis and patterns
- **Individual modules** - JSDoc comments in each file

## 🔧 Configuration

All configuration is in `constants.js`. To modify behavior:

```javascript
// Example: Change cursor blink rate
// Edit constants.js and update the cursor manager

// constants.js
export const CURSOR_BLINK_RATE_MS = 500; // Change this value

// cursor-manager.js will use this constant
import { CURSOR_BLINK_RATE_MS } from './constants.js';
```

## 🎯 Best Practices

1. **Import from new modules first**
   ```javascript
   import { CONSTANTS } from './constants.js';
   import logger from './logger.js';
   ```

2. **Use dependency injection**
   ```javascript
   const manager = new DocumentManager(wasmModule);
   ```

3. **Handle errors properly**
   ```javascript
   try {
     const result = await operation();
   } catch (error) {
     logger.error(CATEGORY, 'Operation failed', { error: error.message });
   }
   ```

4. **Clean up resources**
   ```javascript
   destroy() {
     this.cursor.destroy();
     this.keyboard.destroy();
     this.menuSystem.destroy();
   }
   ```

## 🐛 Debugging

Enable debug logging:

```javascript
import logger, { LOG_LEVELS } from './logger.js';

// Set log level to DEBUG
logger.setLevel(LOG_LEVELS.DEBUG);

// Enable specific category
logger.enableCategory(LOG_CATEGORIES.PARSER);
```

Get performance stats:

```javascript
import performanceMonitor from './performance-monitor.js';

// Get all statistics
const stats = performanceMonitor.getAllStatistics();
console.log('Performance Report:', performanceMonitor.getReport());
```

## 📦 Export Patterns

All modules use consistent export patterns:

```javascript
// Default export (class or singleton)
export default ClassName;

// Named export (for testing or alternative import)
export { ClassName };
```

Import either way:

```javascript
// Default import
import ClassName from './module.js';

// Named import
import { ClassName } from './module.js';
```

## 🔄 Migration Status

| Component | Status | Priority |
|-----------|--------|----------|
| Constants | ✅ Complete | - |
| WASM | ✅ Complete | - |
| Performance | ✅ Complete | - |
| Cursor | ✅ Complete | - |
| Document | ✅ Complete | - |
| Text Input | ✅ Complete | - |
| Menu System | ✅ Complete | - |
| Textarea Renderer | ✅ Complete | - |
| Keyboard | ✅ Complete | - |
| Editor Core | 🔄 In Progress | High |
| UI | 🔄 In Progress | High |
| Renderer | 🔄 In Progress | Medium |
| Events | 🔄 In Progress | Medium |
| Debug | 📋 Planned | Low |

## 📞 Support

For questions about the refactored modules:
1. Check the JSDoc comments in each module
2. Read REFACTORING_COMPLETE.md for detailed information
3. Review usage examples above
4. Check the dependency graph for relationships

---

**Last Updated**: 2025-10-13
**Refactoring Version**: 1.0
**Status**: Production Ready (pending integration)
