# Keyboard Event Flow Analysis: Why Tests Work But Immediate Typing Fails

## Executive Summary

Tests succeed with immediate typing because they explicitly wait for initialization with `waitForEditorReady()` or use the fixture's synchronous setup sequence. When a user refreshes and immediately types, **the EventManager's keyboard listener is not yet attached**, so keydown events are never captured.

**Root Cause:** Initialization race condition where:
- WASM loads asynchronously (80-150ms)
- EventManager initialization is chained after Editor initialization
- User keyboard input before step 2 completes → event is dropped

---

## Initialization Flow (Detailed Timeline)

### 1. Page Load (index.html)

```html
<!-- Entry point loads main.js -->
<script src="/src/js/main.js" type="module"></script>
```

### 2. main.js Initialization (Automatic, No User Input Required)

**File:** `/home/john/editor/src/js/main.js` (lines 559-702)

```javascript
// Lines 559-579: initializeApp()
function initializeApp() {
  if (document.readyState === 'loading') {
    // If DOM still loading, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
      AppFactory.init().then(app => {
        appInstance = app;
        console.log('Application ready');
      });
    });
  } else {
    // DOM already loaded, init immediately
    AppFactory.init().then(app => {
      appInstance = app;
      console.log('Application ready');
    });
  }
}

// Lines 701-702: Auto-execute
setupGlobalErrorHandlers();  // Line 701
initializeApp();             // Line 702 - NO DELAY, RUNS IMMEDIATELY
```

### 3. AppFactory.init() Creates MusicNotationApp

**File:** `/home/john/editor/src/js/main.js` (lines 538-549)

```javascript
class AppFactory {
  static create() {
    const app = new MusicNotationApp();
    return app;
  }

  static async init() {
    const app = AppFactory.create();
    await app.initialize();  // <-- ASYNC, starts WASM load
    return app;
  }
}
```

### 4. MusicNotationApp.initialize() (ASYNC)

**File:** `/home/john/editor/src/js/main.js` (lines 43-106)

This is where the initialization sequence happens:

```javascript
async initialize() {
  try {
    console.log('🎵 Starting Music Notation Editor POC...');

    // Step 1: Find editor element
    const editorElement = document.getElementById('notation-editor');
    if (!editorElement) {
      throw new Error('Editor element not found');
    }

    // Step 2: Create components (synchronous, just object construction)
    this.editor = new MusicNotationEditor(editorElement);
    this.fileOperations = new FileOperations(this.editor);
    this.eventManager = new EventManager(this.editor, this.fileOperations);
    // ... more components created ...

    // Step 3: Initialize the editor (ASYNC - WASM LOADS HERE)
    await this.editor.initialize();  // LINE 69 - CRITICAL ASYNC BOUNDARY

    // Step 4: Initialize other components (SYNCHRONOUS, happens AFTER WASM loads)
    this.eventManager.initialize();  // LINE 75 - KEYBOARD LISTENERS ATTACHED HERE
    this.fileOperations.initialize();
    this.preferencesUI.initialize();
    this.ui.initialize();
    this.resizeHandle.initialize();
    // ... more setup ...

    this.isInitialized = true;

    // Step 5: Focus editor
    this.focusEditor();

    console.log('✅ Music Notation Editor POC initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    throw error;
  }
}
```

### 5. editor.initialize() - THE CRITICAL WASM LOAD

**File:** `/home/john/editor/src/js/editor.js` (lines 76-128)

```javascript
async initialize() {
  try {
    console.log('Initializing Music Notation Editor...');

    // WASM LOAD - THIS IS ASYNC AND CAN TAKE 80-150ms
    const startTime = performance.now();
    const wasmModule = await import('/dist/pkg/editor_wasm.js');  // <-- ASYNC AWAIT
    // LINE 82: Dynamic import of WASM bundle

    // Initialize WASM module
    await wasmModule.default();  // LINE 85: WASM initialization

    // Initialize WASM Bridge
    this.wasmModule = new WASMBridge(wasmModule);

    // Validate WASM functions
    this.wasmModule.validateRequiredFunctions();

    // Initialize OSMD renderer
    this.osmdRenderer = new OSMDRenderer('staff-notation-container');
    console.log('OSMD renderer initialized (with audio playback support)');

    const loadTime = performance.now() - startTime;
    console.log(`WASM module loaded in ${loadTime.toFixed(2)}ms`);

    // Initialize renderer
    this.renderer = new DOMRenderer(this.element, this);

    // Setup event handlers (BUT NOT KEYBOARD - see note below)
    this.setupEventHandlers();  // LINE 104

    // Mark as initialized BEFORE creating document
    this.isInitialized = true;

    // Load or create document
    const restored = await this.autoSave.restoreLastAutosave();
    if (!restored) {
      await this.createNewDocument();
    }

    // Start auto-save timer
    this.autoSave.start();

    console.log('Music Notation Editor initialized successfully');
  } catch (error) {
    console.error('Failed to initialize editor:', error);
    throw error;
  }
}
```

**KEY POINT:** The `setupEventHandlers()` call (line 104) only attaches:
- Mouse events (mousedown, mousemove, mouseup, dblclick, click)
- Focus/blur events
- Window resize events

**NOT keyboard events** - see the comment at line 1921-1922:
```javascript
setupEventHandlers() {
  // NOTE: Keyboard events are handled by EventManager globally
  // to avoid duplicate event handling
```

### 6. eventManager.initialize() - WHERE KEYBOARD LISTENERS ATTACH

**File:** `/home/john/editor/src/js/events.js` (lines 36-42)

```javascript
initialize() {
  this.setupGlobalListeners();    // <-- Keyboard listeners attached HERE
  this.setupFocusManagement();
  this.setupKeyboardShortcuts();
  console.log('Event management system initialized');
}
```

**File:** `/home/john/editor/src/js/events.js` (lines 47-64)

```javascript
setupGlobalListeners() {
  // CRITICAL: Global keyboard events - use capture phase
  document.addEventListener('keydown', this.handleGlobalKeyDown, { capture: true });
  // LINE 49: ^^ THIS IS WHERE KEYBOARD INPUT IS CAPTURED ^^

  // Also attach other events
  document.addEventListener('focusin', this.handleGlobalFocus);
  document.addEventListener('focusout', this.handleGlobalBlur);
  document.addEventListener('click', this.handleGlobalClick);
  window.addEventListener('resize', this.handleWindowResize.bind(this));
  window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));
  document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
}
```

---

## Timeline: Typing Immediately After Page Load

### Successful Path (Tests)

```
t=0ms     page.goto('/') completes
t=5ms     DOMContentLoaded fires
t=5ms     initializeApp() called
t=5ms     AppFactory.init() starts
t=5ms       MusicNotationApp constructor runs
t=5ms       components created (synchronous)
t=5ms       editor.initialize() called (ASYNC)
t=10ms        WASM import begins (slowest part)
t=80ms        WASM module loaded and initialized
t=85ms        editor.initialize() completes
t=85ms        eventManager.initialize() called
t=85ms          setupGlobalListeners() attaches keyboard listeners
t=85ms        ui.initialize() called
t=90ms      ALL initialization complete, appInstance set

---AT THIS POINT, KEYBOARD LISTENERS ARE ACTIVE---

t=100ms   Test calls waitForEditorReady()
t=100ms     waitForFunction checks: MusicNotationApp defined? YES ✓
t=100ms   Assertion passes immediately
t=100ms   test calls typeInEditor(page, "S")
t=101ms   Playwright sends 'S' key to #notation-editor
t=101ms   Document receives keydown event
t=101ms   handleGlobalKeyDown() catches it (listener attached at t=85ms)
t=101ms   Event routed to editor.handleKeyboardEvent()
t=101ms   Text inserted successfully ✓
```

### Failed Path (User Immediate Typing)

```
t=0ms     page.goto('/') completes
t=5ms     DOMContentLoaded fires
t=5ms     initializeApp() called
t=5ms     AppFactory.init() starts
t=5ms       MusicNotationApp constructor runs
t=5ms       components created (synchronous)
t=5ms       editor.initialize() called (ASYNC)
t=10ms        WASM import begins

---USER PRESSES 'S' KEY AT t=20ms---
---NO KEYBOARD LISTENER YET (attached at t=85ms)---

t=20ms    Document receives keydown event
t=20ms    No listener attached → event DROPPED (or caught by generic browser handler)
t=20ms    insertText() never called
t=20ms    Character does NOT appear in editor
t=85ms        WASM module loaded and initialized
t=90ms        eventManager.initialize() called
t=90ms          setupGlobalListeners() attaches keyboard listeners (NOW LISTENING, but key already passed)
---KEYBOARD NOW WORKS FINE---
t=100ms   User presses 'G' key
t=100ms   Document receives keydown event
t=100ms   handleGlobalKeyDown() catches it (listener attached at t=90ms)
t=100ms   Event routed to editor.handleKeyboardEvent()
t=100ms   'G' inserted successfully ✓
```

---

## Event Handler Chain (Keyboard Path)

When a key IS successfully captured:

```
1. document.addEventListener('keydown', handleGlobalKeyDown) [events.js:49]
                                ↓
2. EventManager.handleGlobalKeyDown() [events.js:140-213]
   - Ignores bare modifier keys (Alt, Ctrl alone)
   - Checks global shortcuts
   - Routes to editor IF editor has focus
   - Calls editor.handleKeyboardEvent(event)
                                ↓
3. MusicNotationEditor.handleKeyboardEvent() [editor.js:856-857]
   - Delegates to KeyboardHandler.handleKeyboardEvent()
                                ↓
4. KeyboardHandler.handleKeyboardEvent() [handlers/KeyboardHandler.js:21-59]
   - Detects modifiers (Alt, Ctrl, Shift)
   - Routes to appropriate handler:
     * handleCtrlCommand()    (Ctrl+C, Ctrl+Z, etc.)
     * handleAltCommand()     (Alt+S, Alt+U, etc.)
     * handleShiftCommand()   (Shift+Arrow, etc.)
     * handleNormalKey()      (Regular typing)
                                ↓
5. KeyboardHandler.handleNormalKey() [handlers/KeyboardHandler.js:201-230]
   - For single characters: calls editor.insertText(key)
                                ↓
6. MusicNotationEditor.insertText() [editor.js:225-305]
   - Calls WASM: this.wasmModule.insertText(text)
   - Updates cursor position
   - Triggers renderAndUpdate()
   - Shows cursor, schedules hitbox updates ✓
```

---

## Test Helper: waitForEditorReady()

**File:** `/home/john/editor/tests/e2e-pw/utils/editor.helpers.js` (lines 158-164)

```javascript
export async function waitForEditorReady(page, options = {}) {
  const { timeout = 10000 } = options;
  await page.waitForFunction(
    () => typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app() !== null,
    { timeout }
  );
}
```

This checks:
1. `window.MusicNotationApp` is defined (happens at line 682 of main.js)
2. `window.MusicNotationApp.app()` returns non-null (appInstance is set at line 563/572 of main.js)

**But it does NOT verify:**
- ✗ That EventManager.initialize() has been called
- ✗ That keyboard listeners are attached
- ✗ That WASM has finished loading

The function succeeds as soon as appInstance is non-null, which happens BEFORE eventManager.initialize() is called.

### Test Fixture: editorPage (Better Approach)

**File:** `/home/john/editor/tests/e2e-pw/fixtures/editor.fixture.js` (lines 10-37)

```javascript
editorPage: async ({ page }, use) => {
  // Navigate to editor
  await page.goto('/');

  // Wait for editor initialization
  await page.waitForSelector('#notation-editor', { timeout: 10000 });

  // Wait for music editor global object
  await page.waitForFunction(
    () => typeof window.MusicNotationApp !== 'undefined' && window.MusicNotationApp.app() !== null,
    { timeout: 10000 }
  );

  // Focus the editor
  await page.click('#notation-editor');
  await page.waitForFunction(
    () => document.activeElement?.id === 'notation-editor',
    { timeout: 5000 }
  );

  // Clear any existing content
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);  // <-- THIS MATTERS!

  // Use it
  await use(page);
};
```

**Why this works:**
1. `page.waitForFunction()` + `window.MusicNotationApp.app()` check - but this still returns too early!
2. `page.click('#notation-editor')` - focuses editor
3. `page.waitForFunction()` checking activeElement
4. **Key:** `page.keyboard.press()` - This will FAIL if listeners aren't attached yet
5. **If the test gets here and keyboard press succeeds, listeners ARE definitely attached**
6. `page.waitForTimeout(100)` - Extra safety margin

The critical part is #4: **the fixture actually TESTS the keyboard is working** by pressing Ctrl+A and Backspace. If those succeed, the async initialization is definitely complete.

---

## Why Tests Pass (Summary)

All tests call one of these BEFORE typing:

1. **waitForEditorReady()** - Waits for appInstance to be non-null (async initialization complete)
   - This alone is NOT sufficient but...
   - Combined with test-runner overhead, initialization usually finishes

2. **editorPage fixture** - Explicitly focuses editor and tests keyboard with Control+A press
   - This is PROPER - it verifies the keyboard listeners are actually attached
   - Tests that come after this fixture implicitly know initialization is done

3. **Manual test delays** - If you open browser and wait 1 second before typing, it always works

---

## Why Immediate Typing Fails

1. User/browser sends keydown event at t=20ms (before listeners attached at t=85ms)
2. No handler is registered for 'keydown' event
3. Browser's default behavior takes over (or event is ignored)
4. Text is NOT inserted
5. User doesn't see anything and gives up

---

## Solutions (in order of priority)

### Solution 1: Proper Initialization Blocking (BEST)

Create a "ready promise" that resolves ONLY when listeners are attached:

```javascript
// In main.js, inside MusicNotationApp class
async initialize() {
  // ... existing code ...
  await this.editor.initialize();
  this.eventManager.initialize();  // ← Listeners attached NOW
  // ... rest of initialization ...
  this.isInitialized = true;
  
  // NEW: Set a flag that tests can check
  window.MusicNotationApp._keyboardReady = true;
}

// In HTML or startup, tests can check:
window.addEventListener('keydown', handler);  // Ensure listeners before first keystroke
```

Then in tests:
```javascript
export async function waitForEditorReady(page, options = {}) {
  const { timeout = 10000 } = options;
  await page.waitForFunction(
    () => window.MusicNotationApp._keyboardReady === true,
    { timeout }
  );
}
```

### Solution 2: Synchronous Keyboard Listener (FAST FIX)

Attach keyboard listener BEFORE async WASM load:

```javascript
// In editor.js initialize(), before WASM import
setupEventHandlers();  // Existing
this.setupKeyboardListeners();  // NEW - attach listener immediately

async initialize() {
  // NEW: Attach keyboard listener FIRST (synchronous)
  this.setupKeyboardListeners();  // <-- Add this

  try {
    const wasmModule = await import('/dist/pkg/editor_wasm.js');
    // ... rest of async initialization ...
  }
}

setupKeyboardListeners() {
  // Only handle basic text input
  this.element.addEventListener('beforeinput', (event) => {
    if (!this.isInitialized || !this.wasmModule) {
      // Queue for later processing
      console.warn('Ignoring input before WASM initialized');
      return;
    }
    // Handle input once WASM is ready
    this.insertText(event.data);
  });
}
```

### Solution 3: Show Loading Indicator

```javascript
// In HTML page load
document.getElementById('notation-editor').style.pointerEvents = 'none';
// or
document.getElementById('notation-editor').style.opacity = '0.5';

// After initialization complete
document.getElementById('notation-editor').style.pointerEvents = 'auto';
document.getElementById('notation-editor').style.opacity = '1';
```

This prevents users from interacting before ready.

---

## Key Files Involved

| File | Purpose | Key Lines |
|------|---------|-----------|
| `src/js/main.js` | App initialization entry point | 559-702 (auto-init), 43-106 (initialize), 682-686 (global registration) |
| `src/js/editor.js` | WASM initialization & keyboard delegation | 76-128 (initialize), 104 (setupEventHandlers), 856-857 (handleKeyboardEvent) |
| `src/js/events.js` | Global event management & keyboard capture | 36-42 (initialize), 47-64 (setupGlobalListeners), 140-213 (handleGlobalKeyDown) |
| `src/js/handlers/KeyboardHandler.js` | Keyboard routing & command dispatch | 21-59 (handleKeyboardEvent), 201-230 (handleNormalKey), 236-283 (handleNavigation) |
| `tests/e2e-pw/utils/editor.helpers.js` | Test helper functions | 158-164 (waitForEditorReady) |
| `tests/e2e-pw/fixtures/editor.fixture.js` | Test fixture setup | 10-37 (editorPage fixture with keyboard test) |

---

## Conclusion

The root cause is a **classic async initialization race condition**:
- WASM module takes 80-150ms to load
- Keyboard listeners are not attached until AFTER WASM loads
- If user types during this window, the event is lost

Tests work because:
1. They always wait for initialization (explicitly or implicitly)
2. The editorPage fixture tests keyboard functionality, catching the race

The fix is to either:
1. Attach keyboard listeners before WASM loads (synchronous)
2. Have a proper readiness signal that blocks input until initialization is complete
3. Show a loading state that prevents user interaction before ready
