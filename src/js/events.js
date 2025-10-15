/**
 * Event Management System for Music Notation Editor
 *
 * This class handles global event listeners, focus management,
 * and event routing for the Music Notation Editor.
 */

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

    // Focus management settings
    this.focusSettings = {
      returnTimeout: 50, // ms
      autoFocusCanvas: true,
      focusIndicators: true
    };

    // Bind methods
    this.handleGlobalKeyDown = this.handleGlobalKeyDown.bind(this);
    this.handleGlobalFocus = this.handleGlobalFocus.bind(this);
    this.handleGlobalBlur = this.handleGlobalBlur.bind(this);
    this.handleGlobalClick = this.handleGlobalClick.bind(this);
  }

  /**
     * Initialize the event management system
     */
  initialize() {
    this.setupGlobalListeners();
    this.setupFocusManagement();
    this.setupKeyboardShortcuts();

    console.log('Event management system initialized');
  }

  /**
     * Setup global event listeners
     */
  setupGlobalListeners() {
    // Global keyboard events
    document.addEventListener('keydown', this.handleGlobalKeyDown);

    // Global focus events
    document.addEventListener('focusin', this.handleGlobalFocus);
    document.addEventListener('focusout', this.handleGlobalBlur);

    // Global click events
    document.addEventListener('click', this.handleGlobalClick);

    // Window events
    window.addEventListener('resize', this.handleWindowResize.bind(this));
    window.addEventListener('beforeunload', this.handleBeforeUnload.bind(this));

    // Visibility change (for tab switching)
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
  }

  /**
     * Setup focus management
     */
  setupFocusManagement() {
    // Track focus state changes
    this.addEventListener('focus-changed', (event) => {
      this.focusState.hasFocus = event.detail.hasFocus;
      this.focusState.activeElement = event.detail.element;
      this.focusState.lastFocusTime = performance.now();

      this.updateFocusIndicators(event.detail.hasFocus);
      this.logFocusEvent(event.detail);
    });

    // Setup automatic focus return
    this.addEventListener('focus-return-request', (event) => {
      this.scheduleFocusReturn();
    });
  }

  /**
     * Setup keyboard shortcuts
     */
  setupKeyboardShortcuts() {
    // Define global shortcuts
    this.globalShortcuts = {
      // Tab navigation
      Tab: () => this.handleTabNavigation(),
      'Shift+Tab': () => this.handleShiftTabNavigation(),

      // Editor-specific shortcuts
      Escape: () => this.handleEscapeKey(),
      F1: () => this.showHelp(),

      // File operations shortcuts
      'Alt+n': () => this.handleNewFile(),
      'Alt+N': () => this.handleNewFile(),
      'Alt+o': () => this.handleOpenFile(),
      'Alt+O': () => this.handleOpenFile(),
      'Ctrl+o': () => this.handleOpenFile(),
      'Ctrl+O': () => this.handleOpenFile(),

      // Debug shortcuts
      F12: () => this.toggleDebugMode(),
      'Ctrl+Shift+I': () => this.toggleDebugMode()
    };

    // Prevent default behavior for certain keys when editor has focus
    this.preventDefaultWhenFocused = [
      ' ', 'Tab', 'Shift+Tab', 'ArrowUp', 'ArrowDown',
      'F1', 'F5', 'F7', 'F12',
      // Alt commands for musical notation
      'Alt+s', 'Alt+S', 'Alt+u', 'Alt+U', 'Alt+m', 'Alt+M',
      'Alt+l', 'Alt+L', 'Alt+t', 'Alt+T',
      // Alt commands for file operations
      'Alt+n', 'Alt+N', 'Alt+o', 'Alt+O',
      // Ctrl commands for file operations
      'Ctrl+o', 'Ctrl+O'
    ];
  }

  /**
     * Handle global keyboard events
     */
  handleGlobalKeyDown(event) {
    // Ignore bare modifier key presses (Alt, Ctrl, Shift, Meta by themselves)
    // We only want to process them when they're used WITH another key
    const modifierKeys = ['Alt', 'Control', 'Shift', 'Meta', 'AltGraph'];
    if (modifierKeys.includes(event.key)) {
      console.log('⏭️ Ignoring bare modifier key press:', event.key);
      return;
    }

    // Debug logging for Alt key combinations
    if (event.altKey) {
      console.log('🔍 EventManager Alt key debug:');
      console.log('  event.key:', event.key);
      console.log('  event.code:', event.code);
      console.log('  event.altKey:', event.altKey);
      console.log('  event.ctrlKey:', event.ctrlKey);
      console.log('  event.shiftKey:', event.shiftKey);
    }

    const key = this.getKeyString(event);

    // Check for global shortcuts
    if (this.globalShortcuts[key]) {
      event.preventDefault();
      event.stopPropagation();
      this.globalShortcuts[key]();
      return;
    }

    // Route to editor if it has focus
    if (this.editorFocus()) {
      // Prevent certain default behaviors
      if (this.preventDefaultWhenFocused.includes(key)) {
        event.preventDefault();
      }

      // Route to editor
      if (this.editor && this.editor.handleKeyboardEvent) {
        this.editor.handleKeyboardEvent(event);
        // Prevent further propagation after editor handles the event
        event.stopPropagation();
      }
    }
  }

  /**
     * Handle global focus events
     */
  handleGlobalFocus(event) {
    const target = event.target;

    // Check if focus is on editor canvas
    if (this.isEditorElement(target)) {
      this.handleEditorFocus(target);
    } else {
      this.handleEditorBlur();
    }

    // Dispatch focus changed event
    this.dispatchEvent('focus-changed', {
      hasFocus: this.isEditorElement(target),
      element: target,
      timestamp: performance.now()
    });
  }

  /**
     * Handle global blur events
     */
  handleGlobalBlur(event) {
    const relatedTarget = event.relatedTarget;

    // Check if focus is still within editor
    if (!this.isEditorElement(relatedTarget) && !relatedTarget?.closest('#editor-container')) {
      this.handleEditorBlur();
    }
  }

  /**
     * Handle global click events
     */
  handleGlobalClick(event) {
    const target = event.target;

    // Handle clicks outside editor
    if (!this.isEditorElement(target) && !target.closest('#editor-container')) {
      this.handleOutsideClick(event);
    }

    // Handle clicks on menu items
    if (target.closest('[data-menu-item]')) {
      this.handleMenuItemClick(target);
    }

    // Handle clicks on tabs
    if (target.closest('[data-tab]')) {
      this.handleTabClick(target);
    }
  }

  /**
     * Handle editor focus
     */
  handleEditorFocus(canvas) {
    if (!this.focusState.hasFocus) {
      const focusTime = performance.now();

      // Show focus indicators
      if (this.focusSettings.focusIndicators) {
        canvas.classList.add('editor-focused');
        document.body.classList.add('editor-active');
      }

      // Log focus activation time
      const activationTime = focusTime - this.focusState.lastFocusTime;
      if (activationTime > 0 && activationTime < 1000) {
        console.log(`Focus activated in ${activationTime.toFixed(2)}ms`);
      }

      // Focus the cursor
      if (this.editor && this.editor.showCursor) {
        this.editor.showCursor();
      }
    }
  }

  /**
     * Handle editor blur
     */
  handleEditorBlur() {
    if (this.focusState.hasFocus) {
      // Hide focus indicators
      if (this.focusSettings.focusIndicators) {
        const canvas = document.getElementById('notation-canvas');
        if (canvas) {
          canvas.classList.remove('editor-focused');
        }
        document.body.classList.remove('editor-active');
      }

      // Hide cursor
      if (this.editor && this.editor.hideCursor) {
        this.editor.hideCursor();
      }
    }
  }

  /**
     * Handle clicks outside the editor
     */
  handleOutsideClick(event) {
    // Could implement context menu dismissal or other behaviors
    console.log('Click detected outside editor');
  }

  /**
     * Handle tab navigation
     */
  handleTabNavigation() {
    // Navigate to next focusable element
    const focusableElements = this.getFocusableElements();
    const currentIndex = focusableElements.indexOf(document.activeElement);

    if (currentIndex < focusableElements.length - 1) {
      focusableElements[currentIndex + 1].focus();
    } else {
      focusableElements[0].focus();
    }
  }

  /**
     * Handle Shift+Tab navigation
     */
  handleShiftTabNavigation() {
    // Navigate to previous focusable element
    const focusableElements = this.getFocusableElements();
    const currentIndex = focusableElements.indexOf(document.activeElement);

    if (currentIndex > 0) {
      focusableElements[currentIndex - 1].focus();
    } else {
      focusableElements[focusableElements.length - 1].focus();
    }
  }

  /**
     * Handle Escape key
     */
  handleEscapeKey() {
    // Could implement modal dismissal or other escape behaviors
    console.log('Escape key pressed');
  }

  /**
     * Handle Alt+N (New File)
     */
  handleNewFile() {
    console.log('Alt+N: New file shortcut triggered');
    // Use the same path as File menu -> New
    if (this.editor && this.editor.ui && this.editor.ui.executeMenuAction) {
      this.editor.ui.executeMenuAction('new-document');
    } else {
      console.warn('UI menu action handler not available');
    }
  }

  /**
     * Handle Alt+O / Ctrl+O (Open File)
     */
  handleOpenFile() {
    console.log('Ctrl+O: Open file shortcut triggered');
    // Use the same path as File menu -> Open
    if (this.editor && this.editor.ui && this.editor.ui.executeMenuAction) {
      this.editor.ui.executeMenuAction('open-document');
    } else {
      console.warn('UI menu action handler not available');
    }
  }

  /**
     * Handle menu item clicks
     */
  handleMenuItemClick(target) {
    const menuItem = target.closest('[data-menu-item]');
    const action = menuItem?.dataset.menuItem;

    if (action && this.editor && this.editor.handleMenuAction) {
      this.editor.handleMenuAction(action);
    }
  }

  /**
     * Handle tab clicks
     */
  handleTabClick(target) {
    const tab = target.closest('[data-tab]');
    const tabName = tab?.dataset.tab;

    if (tabName) {
      this.switchTab(tabName);
    }
  }

  /**
     * Switch to a specific tab
     */
  switchTab(tabName) {
    // Hide all tab content
    document.querySelectorAll('[data-tab-content]').forEach(content => {
      content.classList.add('hidden');
    });

    // Remove active class from all tabs
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.classList.remove('active');
    });

    // Show selected tab content
    const contentElement = document.querySelector(`[data-tab-content="${tabName}"]`);
    if (contentElement) {
      contentElement.classList.remove('hidden');
    }

    // Add active class to selected tab
    const tabElement = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabElement) {
      tabElement.classList.add('active');
    }

    // Request focus return to editor
    this.scheduleFocusReturn();
  }

  /**
     * Schedule focus return to editor
     */
  scheduleFocusReturn() {
    setTimeout(() => {
      this.returnFocusToEditor();
    }, this.focusSettings.returnTimeout);
  }

  /**
     * Return focus to editor canvas
     */
  returnFocusToEditor() {
    const canvas = document.getElementById('notation-canvas');
    if (canvas) {
      canvas.focus();
    }
  }

  /**
     * Handle window resize
     */
  handleWindowResize() {
    // Handle resize events
    if (this.editor && this.editor.renderer) {
      this.editor.renderer.resize();
    }
  }

  /**
     * Handle before unload
     */
  handleBeforeUnload(event) {
    // Could implement unsaved changes warning
    console.log('Page unloading');
  }

  /**
     * Handle visibility change
     */
  handleVisibilityChange() {
    if (document.hidden) {
      // Page hidden - pause background operations
      console.log('Page hidden');
    } else {
      // Page visible - resume operations
      console.log('Page visible');
    }
  }

  /**
     * Show help dialog
     */
  showHelp() {
    alert(`
Music Notation Editor POC - Help

File Operations:
• Alt+N: New file
• Alt+O or Ctrl+O: Open file

Musical Notation:
• Number System: 1-7 (with #/b for accidentals)
• Western System: cdefgab/CDEFGAB (with #/b for accidentals)
• Alt+S: Apply slur to selection
• Alt+U/M/L: Apply octave +1/0/-1 to selection
• Alt+T: Enter tala notation

Navigation:
• Arrow Keys: Navigate (when implemented)
• Shift+Arrow: Select (when implemented)
• Tab/Shift+Tab: Navigate between focusable elements
• Escape: Dismiss dialogs

Focus Management:
• Click in editor or press Tab to focus
• Focus automatically returns after menu operations
• Editor shows visual focus indication
        `);
  }

  /**
     * Toggle debug mode
     */
  toggleDebugMode() {
    const debugPanel = document.querySelector('.debug-panel');
    if (debugPanel) {
      debugPanel.classList.toggle('hidden');
    }
  }

  /**
     * Check if editor currently has focus
     */
  editorFocus() {
    const canvas = document.getElementById('notation-canvas');
    return canvas === document.activeElement || canvas.contains(document.activeElement);
  }

  /**
     * Check if element is part of the editor
     */
  isEditorElement(element) {
    if (!element) return false;

    const canvas = document.getElementById('notation-canvas');
    return element === canvas || element.closest('#notation-canvas, #editor-container');
  }

  /**
     * Get list of focusable elements
     */
  getFocusableElements() {
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '#notation-canvas'
    ];

    return Array.from(document.querySelectorAll(selectors.join(', ')))
      .filter(el => el.offsetParent !== null); // Only visible elements
  }

  /**
     * Update focus indicators
     */
  updateFocusIndicators(hasFocus) {
    // Update UI elements based on focus state
    const focusStatus = document.getElementById('focus-status');
    if (focusStatus) {
      focusStatus.textContent = hasFocus ? 'Editor focused' : 'No focus';
      focusStatus.className = hasFocus ? 'text-success' : 'text-ui-disabled-text';
    }
  }

  /**
     * Log focus events for debugging
     */
  logFocusEvent(detail) {
    if (detail.hasFocus) {
      console.log('Editor focused:', detail.element);
    } else {
      console.log('Editor blurred');
    }
  }

  /**
     * Add event listener
     */
  addEventListener(event, handler) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(handler);
  }

  /**
     * Remove event listener
     */
  removeEventListener(event, handler) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(handler);
    }
  }

  /**
     * Dispatch custom event
     */
  dispatchEvent(event, detail = {}) {
    if (this.eventListeners.has(event)) {
      const customEvent = new CustomEvent(event, { detail });
      this.eventListeners.get(event).forEach(handler => {
        handler(customEvent);
      });
    }
  }

  /**
     * Get key string from keyboard event
     */
  getKeyString(event) {
    const parts = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');

    // Fix for browsers that return "alt" instead of the actual key when Alt is pressed
    let key = event.key;
    if (event.altKey && (key === 'alt' || key === 'Alt')) {
      const code = event.code;
      console.log('🔧 getKeyString detected Alt key issue:');
      console.log('  originalKey:', event.key);
      console.log('  code:', event.code);
      console.log('  code.startsWith("Key"):', code && code.startsWith('Key'));

      if (code && code.startsWith('Key')) {
        key = code.replace('Key', '').toLowerCase();
        console.log('  fixedKey:', key);
      } else {
        console.log('  ❌ Could not fix - code does not start with "Key"');
      }
    }

    parts.push(key);

    const result = parts.join('+');
    if (event.altKey) {
      console.log('🔍 getKeyString final result:', result);
    }

    return result;
  }

  /**
     * Clean up event listeners
     */
  destroy() {
    document.removeEventListener('keydown', this.handleGlobalKeyDown);
    document.removeEventListener('focusin', this.handleGlobalFocus);
    document.removeEventListener('focusout', this.handleGlobalBlur);
    document.removeEventListener('click', this.handleGlobalClick);

    this.eventListeners.clear();
  }
}

export default EventManager;
