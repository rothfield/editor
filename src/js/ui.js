/**
 * UI Components for Music Notation Editor
 *
 * This class provides UI components including menu system,
 * tab management, and user interface elements for the Music Notation Editor.
 */

import { DOM_SELECTORS } from './constants/editorConstants.js';
import { updateKeySignatureDisplay as updateKeySigDisplay } from './key-signature-selector.js';
import logger, { LOG_CATEGORIES } from './logger.js';

class UI {
  constructor(editor, fileOperations = null, preferencesUI = null) {
    this.editor = editor;
    this.fileOperations = fileOperations;
    this.preferencesUI = preferencesUI;
    this.activeMenu = null;
    this.activeTab = 'staff-notation';
    this.isInitialized = false; // Track initialization state to prevent timer scheduling during init
    this.menuListeners = new Map();
    this.keySignatureSelector = null; // Will be initialized after DOM is ready
    this.constraintsDialog = null; // Will be initialized after DOM is ready

    // Constraint state
    this.constraintEnabled = true; // Whether the constraint is currently active (can be toggled off)

    // localStorage settings
    this.tabSaveDebounceMs = 2000;
    this.tabSaveTimeout = null;

    // Bind methods
    this.handleMenuToggle = this.handleMenuToggle.bind(this);
    this.handleMenuItemClick = this.handleMenuItemClick.bind(this);
    this.handleTabClick = this.handleTabClick.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleModeToggleClick = this.handleModeToggleClick.bind(this);
    this.handleModeToggleDblClick = this.handleModeToggleDblClick.bind(this);
  }

  /**
     * Initialize UI components
     */
  initialize() {
    this.setupMenus();
    this.setupTabs();
    this.setupEventListeners();
    this.updateCurrentPitchSystemDisplay();
    this.restoreTabPreference();
    this.initializeKeySignatureSelector();
    this.initializeConstraintsDialog();
    this.setupModeToggleButton();

    // Update key signature display after a short delay (wait for document to load)
    setTimeout(() => {
      this.updateKeySignatureCornerDisplay();
      this.updateModeToggleDisplay();
    }, 500);

    // Mark UI as initialized - this prevents staff notation timer scheduling during init
    // (prevents double-render: one from autosave timer, one from switchTab)
    this.isInitialized = true;

    logger.info(LOG_CATEGORIES.UI, 'UI components initialized');
  }

  /**
   * Initialize the Key Signature Selector modal
   */
  initializeKeySignatureSelector() {
    // Import and initialize the key signature selector
    import('./key-signature-selector.js').then(module => {
      this.keySignatureSelector = module.initKeySignatureSelector(this);
      logger.info(LOG_CATEGORIES.UI, 'Key Signature Selector initialized');
    }).catch(error => {
      logger.error(LOG_CATEGORIES.UI, 'Failed to load key signature selector', { error });
    });
  }

  /**
   * Initialize the Constraints Dialog modal
   */
  initializeConstraintsDialog() {
    // Import and initialize the constraints dialog
    import('./ConstraintsDialog.js').then(module => {
      this.constraintsDialog = new module.ConstraintsDialog(this.editor);
      logger.info(LOG_CATEGORIES.UI, 'Constraints Dialog initialized');
    }).catch(error => {
      logger.error(LOG_CATEGORIES.UI, 'Failed to load constraints dialog', { error });
    });
  }

  /**
     * Setup menu system
     */
  setupMenus() {
    // Setup File menu
    this.setupFileMenu();

    // Setup Edit menu
    this.setupEditMenu();

    // Setup Line menu
    this.setupLineMenu();

    // Setup Ornament menu
    this.setupOrnamentMenu();

    // Add menu toggle listeners
    document.getElementById('file-menu-button').addEventListener('click', (event) => {
      this.handleMenuToggle('file', event);
    });

    document.getElementById('edit-menu-button').addEventListener('click', (event) => {
      this.handleMenuToggle('edit', event);
    });

    document.getElementById('line-menu-button').addEventListener('click', (event) => {
      this.handleMenuToggle('line', event);
    });

    document.getElementById('ornament-menu-button').addEventListener('click', (event) => {
      this.handleMenuToggle('ornament', event);
    });
  }

  /**
     * Setup File menu
     */
  setupFileMenu() {
    const menuItems = [
      { id: 'menu-new', label: 'New', action: 'new-document' },
      { id: 'menu-open-file', label: 'Open File...', action: 'open-file' },
      { id: 'menu-separator-0', label: null, separator: true },
      { id: 'menu-save-to-storage', label: 'Save to Storage...', action: 'save-to-storage' },
      { id: 'menu-load-from-storage', label: 'Load from Storage...', action: 'load-from-storage' },
      { id: 'menu-separator-1', label: null, separator: true },
      { id: 'menu-export-json', label: 'Export as JSON...', action: 'export-json' },
      { id: 'menu-export-musicxml', label: 'Export MusicXML...', action: 'export-musicxml' },
      { id: 'menu-import-json', label: 'Import from JSON...', action: 'import-json' },
      { id: 'menu-import-musicxml', label: 'Import MusicXML...', action: 'import-musicxml' },
      { id: 'menu-separator-2', label: null, separator: true },
      { id: 'menu-set-title', label: 'Set Title...', action: 'set-title' },
      { id: 'menu-set-composer', label: 'Set Composer...', action: 'set-composer' },
      { id: 'menu-set-tonic', label: 'Set Tonic...', action: 'set-tonic' },
      { id: 'menu-set-pitch-system', label: 'Set Pitch System...', action: 'set-pitch-system' },
      { id: 'menu-set-key-signature', label: 'Set Key Signature...', action: 'set-key-signature' },
      { id: 'menu-set-constraints', label: 'Set Constraints...', action: 'set-constraints' },
      { id: 'menu-separator-3', label: null, separator: true },
      { id: 'menu-preferences', label: 'Preferences...', action: 'preferences' }
    ];

    const fileMenu = document.getElementById('file-menu');
    fileMenu.innerHTML = '';

    menuItems.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        fileMenu.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.id = item.id;
        menuItem.className = 'menu-item';
        menuItem.dataset.action = item.action;
        menuItem.textContent = item.label;
        menuItem.addEventListener('click', this.handleMenuItemClick);
        fileMenu.appendChild(menuItem);
      }
    });
  }

  /**
     * Setup Edit menu
     */
  setupEditMenu() {
    const menuItems = [
      { id: 'menu-undo', label: 'Undo (Ctrl+Z)', action: 'undo', testid: 'menu-undo' },
      { id: 'menu-redo', label: 'Redo (Ctrl+Y)', action: 'redo', testid: 'menu-redo' },
      { id: 'menu-separator-0', label: null, separator: true },
      { id: 'menu-copy', label: 'Copy (Ctrl+C)', action: 'copy', testid: 'menu-copy' },
      { id: 'menu-cut', label: 'Cut (Ctrl+X)', action: 'cut', testid: 'menu-cut' },
      { id: 'menu-paste', label: 'Paste (Ctrl+V)', action: 'paste', testid: 'menu-paste' },
      { id: 'menu-separator-1', label: null, separator: true },
      { id: 'menu-toggle-ornament-edit-mode', label: 'Toggle Ornament Edit Mode (Alt+Shift+O)', action: 'toggle-ornament-edit-mode', checkable: true, checked: this.editor.ornamentEditMode, testid: 'menu-toggle-ornament-edit-mode' },
      { id: 'menu-separator-2', label: null, separator: true },
      { id: 'menu-apply-slur', label: 'Apply Slur (Alt+S)', action: 'apply-slur' },
      { id: 'menu-octave-highest', label: 'Highest Octave (Alt+H)', action: 'octave-highest' },
      { id: 'menu-octave-upper', label: 'Upper Octave (Alt+U)', action: 'octave-upper' },
      { id: 'menu-octave-middle', label: 'Middle Octave (Alt+M)', action: 'octave-middle' },
      { id: 'menu-octave-lower', label: 'Lower Octave (Alt+L)', action: 'octave-lower' },
      { id: 'menu-octave-lowest', label: 'Lowest Octave (Alt+K)', action: 'octave-lowest' }
    ];

    const editMenu = document.getElementById('edit-menu');
    editMenu.innerHTML = '';

    menuItems.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        editMenu.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.id = item.id;
        menuItem.className = 'menu-item';
        menuItem.dataset.action = item.action;

        // Add data-testid attributes (for E2E tests)
        if (item.testid) {
          menuItem.dataset.testid = item.testid;
        }
        if (item.id === 'menu-edit-ornaments') {
          menuItem.dataset.testid = 'btn-toggle-ornament-edit-mode';
        }

        if (item.checkable) {
          // Add checkbox indicator for checkable items
          const checkbox = document.createElement('span');
          checkbox.className = 'menu-checkbox';
          checkbox.textContent = item.checked ? '✓ ' : '☐ '; // Checkmark or empty square
          checkbox.dataset.checked = item.checked ? 'true' : 'false';
          menuItem.appendChild(checkbox);

          const label = document.createElement('span');
          label.textContent = item.label;
          menuItem.appendChild(label);
        } else if (item.id === 'menu-toggle-ornament-edit-mode') {
          // Specific handling for ornament edit mode to show its checked state
          const checkbox = document.createElement('span');
          checkbox.className = 'menu-checkbox';
          checkbox.textContent = this.editor.ornamentEditMode ? '✓ ' : '☐ ';
          checkbox.dataset.checked = this.editor.ornamentEditMode ? 'true' : 'false';
          menuItem.appendChild(checkbox);

          const label = document.createElement('span');
          label.textContent = item.label;
          menuItem.appendChild(label);
        } else {
          menuItem.textContent = item.label;
        }

        menuItem.addEventListener('click', this.handleMenuItemClick);
        editMenu.appendChild(menuItem);
      }
    });
  }

  /**
     * Setup Line menu
     */
  setupLineMenu() {
    // Get current line's new_system state if a line is selected
    let currentLineNewSystem = false;
    if (this.editor && this.editor.getDocument()) {
      const cursor = this.editor.getDocument().state.cursor;
      const line = this.editor.getDocument().lines[cursor.line];
      if (line) {
        currentLineNewSystem = line.new_system || false;
      }
    }

    const menuItems = [
      { id: 'menu-select-all', label: 'Select Line (triple-click)', action: 'select-all' },
      { id: 'menu-separator-0', label: null, separator: true },
      { id: 'menu-set-label', label: 'Set Label...', action: 'set-label' },
      { id: 'menu-set-tonic', label: 'Set Tonic...', action: 'set-line-tonic' },
      { id: 'menu-set-pitch-system', label: 'Set Pitch System...', action: 'set-line-pitch-system' },
      { id: 'menu-set-lyrics', label: 'Set Lyrics...', action: 'set-lyrics' },
      { id: 'menu-set-tala', label: 'Set Tala...', action: 'set-tala' },
      { id: 'menu-set-key-signature', label: 'Set Key Signature...', action: 'set-line-key-signature' }
    ];

    const lineMenu = document.getElementById('line-menu');
    lineMenu.innerHTML = '';

    menuItems.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        lineMenu.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.id = item.id;
        menuItem.className = 'menu-item';
        menuItem.dataset.action = item.action;

        if (item.checkable) {
          // Add checkbox indicator for checkable items
          const checkbox = document.createElement('span');
          checkbox.className = 'menu-checkbox';
          checkbox.textContent = item.checked ? '✓ ' : '✗ '; // Checkmark or X
          checkbox.dataset.checked = item.checked ? 'true' : 'false';
          menuItem.appendChild(checkbox);

          const label = document.createElement('span');
          label.textContent = item.label;
          menuItem.appendChild(label);
        } else {
          menuItem.textContent = item.label;
        }

        menuItem.addEventListener('click', this.handleMenuItemClick);
        lineMenu.appendChild(menuItem);
      }
    });
  }

  /**
   * Setup Ornament menu
   */
  setupOrnamentMenu() {
    // Helper: Get glyph for octave-shifted character (from font_utils.rs logic)
    const getGlyph = (baseChar, octaveShift) => {
      const ALL_CHARS = "1234567CDEFGABcdefgabSrRgGmMPdDnNdrmfsltDRMFSLT";
      const PUA_START = 0xE000;

      if (octaveShift === 0 || !baseChar) return baseChar;

      const index = ALL_CHARS.indexOf(baseChar);
      if (index === -1) return baseChar;

      let variant;
      switch (octaveShift) {
        case 1: variant = 0; break;   // 1 dot above
        case 2: variant = 1; break;   // 2 dots above
        case -1: variant = 2; break;  // 1 dot below
        case -2: variant = 3; break;  // 2 dots below
        default: return baseChar;
      }

      const codepoint = PUA_START + (index * 4) + variant;
      return String.fromCodePoint(codepoint);
    };

    // Get current cell's ornament (if any)
    let currentOrnament = null;
    if (this.editor && this.editor.getDocument()) {
      const cursor = this.editor.getDocument().state.cursor;
      const line = this.editor.getDocument().lines[cursor.line];
      if (line && cursor.col > 0) {
        const cellIndex = cursor.col - 1;
        if (cellIndex < line.cells.length) {
          const cell = line.cells[cellIndex];
          if (cell.ornament) {
            const placement = cell.ornament.placement || 'before';
            // Apply glyph substitution for octave shifts in ornament cells
            const notation = cell.ornament.cells
              .map(c => {
                const baseChar = c.char.charAt(0);
                const octaveShift = c.octave || 0;
                return getGlyph(baseChar, octaveShift);
              })
              .join('');
            currentOrnament = { placement, notation };
          }
        }
      }
    }

    // Build labels for placement options, showing ornament if it exists
    const beforeLabel = currentOrnament?.placement === 'before'
      ? `Before - ${currentOrnament.notation}`
      : 'Before';
    const ontopLabel = currentOrnament?.placement === 'on-top'
      ? `On top - ${currentOrnament.notation}`
      : 'On top';
    const afterLabel = currentOrnament?.placement === 'after'
      ? `After - ${currentOrnament.notation}`
      : 'After';

    const menuItems = [
      { id: 'menu-ornament-before', label: beforeLabel, action: 'ornament-position-before', checkable: true, checked: currentOrnament?.placement === 'before' || !currentOrnament, hasOrnationNotation: !!currentOrnament?.placement === 'before' && currentOrnament },
      { id: 'menu-ornament-ontop', label: ontopLabel, action: 'ornament-position-ontop', checkable: true, checked: currentOrnament?.placement === 'on-top', hasOrnationNotation: currentOrnament?.placement === 'on-top' && currentOrnament },
      { id: 'menu-ornament-after', label: afterLabel, action: 'ornament-position-after', checkable: true, checked: currentOrnament?.placement === 'after', hasOrnationNotation: currentOrnament?.placement === 'after' && currentOrnament },
      { id: 'menu-separator-0', label: null, separator: true },
      { id: 'menu-ornament-selection-to-ornament', label: 'Selection to Ornament', action: 'ornament-selection-to-ornament', testid: 'menu-ornament-selection-to-ornament' },
      { id: 'menu-separator-1', label: null, separator: true },
      { id: 'menu-ornament-copy', label: 'Copy', action: 'ornament-copy', testid: 'menu-ornament-copy' },
      { id: 'menu-ornament-paste', label: 'Ornament from Clipboard', action: 'ornament-paste', testid: 'menu-ornament-paste', shortcut: 'Alt+O' },
      { id: 'menu-ornament-clear', label: 'Clear', action: 'ornament-clear', testid: 'menu-ornament-clear' }
    ];

    const ornamentMenu = document.getElementById('ornament-menu');
    ornamentMenu.innerHTML = '';

    menuItems.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        ornamentMenu.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.id = item.id;
        menuItem.className = 'menu-item';
        menuItem.dataset.action = item.action;

        // Add data-testid attributes (for E2E tests)
        if (item.testid) {
          menuItem.dataset.testid = item.testid;
        }

        if (item.checkable) {
          // Add checkbox indicator for checkable items (radio-style for positions)
          const checkbox = document.createElement('span');
          checkbox.className = 'menu-checkbox';
          checkbox.textContent = item.checked ? '✓ ' : '  '; // Checkmark or empty
          checkbox.dataset.checked = item.checked ? 'true' : 'false';
          menuItem.appendChild(checkbox);

          const label = document.createElement('span');
          label.textContent = item.label;
          // Apply NotationFont if label contains ornament notation
          if (item.hasOrnationNotation) {
            label.style.fontFamily = "'NotationFont', monospace";
          }
          menuItem.appendChild(label);

          // Add shortcut if present
          if (item.shortcut) {
            const shortcut = document.createElement('span');
            shortcut.className = 'menu-shortcut';
            shortcut.textContent = item.shortcut;
            shortcut.style.marginLeft = 'auto';
            shortcut.style.opacity = '0.6';
            shortcut.style.fontSize = '0.9em';
            menuItem.appendChild(shortcut);
            menuItem.style.display = 'flex';
            menuItem.style.justifyContent = 'space-between';
          }
        } else {
          // Create label span for non-checkable items
          const label = document.createElement('span');
          label.textContent = item.label;
          menuItem.appendChild(label);

          // Add shortcut if present
          if (item.shortcut) {
            const shortcut = document.createElement('span');
            shortcut.className = 'menu-shortcut';
            shortcut.textContent = item.shortcut;
            shortcut.style.marginLeft = 'auto';
            shortcut.style.opacity = '0.6';
            shortcut.style.fontSize = '0.9em';
            menuItem.appendChild(shortcut);
            menuItem.style.display = 'flex';
            menuItem.style.justifyContent = 'space-between';
          }
        }

        menuItem.addEventListener('click', this.handleMenuItemClick);
        ornamentMenu.appendChild(menuItem);
      }
    });
  }

  /**
     * Setup tab system
     */
  setupTabs() {
    const tabButtons = document.querySelectorAll('[data-tab]');
    const tabContents = document.querySelectorAll('[data-tab-content]');

    tabButtons.forEach(button => {
      button.addEventListener('click', this.handleTabClick);
    });

    // Note: Initial tab is set by restoreTabPreference() below in initialize()
    // Do NOT call switchTab() here - it causes duplicate rendering on initial load
  }

  /**
     * Setup event listeners
     */
  setupEventListeners() {
    // Handle outside clicks to close menus
    document.addEventListener('click', this.handleOutsideClick);

    // Handle keyboard navigation in menus
    document.addEventListener('keydown', this.handleMenuKeyboard.bind(this));
  }

  /**
     * Handle menu toggle
     */
  handleMenuToggle(menuName, event) {
    // Prevent event from propagating to avoid interfering with editor
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const menu = document.getElementById(`${menuName}-menu`);
    const button = document.getElementById(`${menuName}-menu-button`);

    if (!menu || !button) return;

    // Close other menus first
    if (this.activeMenu && this.activeMenu !== menuName) {
      this.closeAllMenus();
    }

    // Toggle current menu visibility
    const isHidden = menu.classList.contains('hidden');

    if (isHidden) {
      // Refresh ornament menu before showing (to display current ornament text)
      if (menuName === 'ornament') {
        this.setupOrnamentMenu();
      }

      // Refresh line menu before showing
      if (menuName === 'line') {
        this.setupLineMenu();
      }

      // Show menu
      menu.classList.remove('hidden');
      button.classList.add('bg-ui-active');
      this.activeMenu = menuName;
    } else {
      // Hide menu
      menu.classList.add('hidden');
      button.classList.remove('bg-ui-active');
      this.activeMenu = null;
    }
  }

  /**
     * Handle menu item clicks
     */
  async handleMenuItemClick(event) {
    logger.debug(LOG_CATEGORIES.UI, 'handleMenuItemClick event received');
    const menuItem = event.target.closest('.menu-item');
    if (!menuItem) {
      logger.warn(LOG_CATEGORIES.UI, 'No menu item found in event target');
      return;
    }

    const action = menuItem.dataset.action;
    logger.debug(LOG_CATEGORIES.UI, 'Menu item action', { action });
    if (!action) {
      logger.warn(LOG_CATEGORIES.UI, 'No action found on menu item');
      return;
    }

    // Prevent event from propagating and interfering with editor events
    event.preventDefault();
    event.stopPropagation();

    await this.executeMenuAction(action);

    // Close menu after action
    this.closeAllMenus();

    // Return focus to editor
    this.returnFocusToEditor();
  }

  /**
     * Handle tab clicks
     */
  handleTabClick(event) {
    const tab = event.target.closest('[data-tab]');
    if (!tab) return;

    const tabName = tab.dataset.tab;
    this.switchTab(tabName);
  }

  /**
     * Switch to a specific tab
     */
  async switchTab(tabName) {
    logger.debug(LOG_CATEGORIES.UI, `switchTab called`, { tabName });

    // Hide all tab contents
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

    this.activeTab = tabName;
    logger.debug(LOG_CATEGORIES.UI, `activeTab set`, { activeTab: this.activeTab });

    // Save tab preference to localStorage with debounce
    this.scheduleTabSave();

    // Render staff notation if switching to staff notation tab
    if (tabName === 'staff-notation' && this.editor) {
      // **CRITICAL FIX**: Cancel any debounced staff notation update
      // This prevents double-rendering: one from the debounced timer + one from switchTab
      // (The debounced timer is set by editor.render() when createNewDocument() is called during init)
      if (this.editor.staffNotationTimer) {
        clearTimeout(this.editor.staffNotationTimer);
        this.editor.staffNotationTimer = null;
      }

      // Clear the OSMD renderer's hash cache to force a fresh render
      // This ensures that switching back to the tab triggers a re-render even if MusicXML hash is the same
      if (this.editor.osmdRenderer) {
        this.editor.osmdRenderer.lastMusicXmlHash = null;
      }

      // **CRITICAL FIX**: Refocus the editor before rendering
      // When switching from another tab (like lilypond), the focus is on that tab
      // If we don't refocus the editor, keyboard input will be ignored
      this.returnFocusToEditor();

      // Give the focus a moment to settle before rendering
      await new Promise(resolve => setTimeout(resolve, 50));

      await this.editor.renderStaffNotation();
    } else {
      // Request focus return to editor for other tabs too
      this.returnFocusToEditor();
    }

    // Update inspector tab content when switching tabs
    // This ensures the newly visible tab shows the latest document state
    if (this.editor) {
      this.editor.updateDocumentDisplay();
    }
  }

  /**
   * Schedule tab preference save with debounce
   */
  scheduleTabSave() {
    // Clear existing timeout
    if (this.tabSaveTimeout) {
      clearTimeout(this.tabSaveTimeout);
    }

    // Set new timeout to save after 2 seconds of inactivity
    this.tabSaveTimeout = setTimeout(() => {
      this.saveTabPreference();
      this.tabSaveTimeout = null;
    }, this.tabSaveDebounceMs);
  }

  /**
   * Save active tab preference to localStorage
   */
  saveTabPreference() {
    try {
      localStorage.setItem('editor_active_tab', this.activeTab);
      logger.info(LOG_CATEGORIES.UI, `Tab Preference: Saved active tab`, { activeTab: this.activeTab });
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Failed to save tab preference to localStorage', { error });
    }
  }

  /**
   * Restore tab preference from localStorage on initialization
   */
  restoreTabPreference() {
    try {
      const savedTab = localStorage.getItem('editor_active_tab');
      if (savedTab) {
        // Verify the saved tab exists in the DOM
        const tabElement = document.querySelector(`[data-tab="${savedTab}"]`);
        if (tabElement) {
          this.switchTab(savedTab);
          logger.info(LOG_CATEGORIES.UI, `Tab Preference: Restored active tab`, { savedTab });
          return;
        }
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Failed to restore tab preference from localStorage', { error });
    }

    // Fallback to default tab if nothing was saved or restoration failed
    this.switchTab('staff-notation');
  }

  /**
     * Execute menu action
     */
  async executeMenuAction(action) {
    logger.debug(LOG_CATEGORIES.UI, 'executeMenuAction called', { action });
    switch (action) {
      case 'new-document':
        this.newDocument();
        break;
      case 'open-file':
        this.openFile();
        break;
      case 'open-document':
        this.openDocument();
        break;
      case 'save-document':
        this.saveDocument();
        break;
      case 'save-to-storage':
        this.saveToStorage();
        break;
      case 'load-from-storage':
        this.loadFromStorage();
        break;
      case 'export-json':
        this.exportAsJSON();
        break;
      case 'export-musicxml':
        this.exportMusicXML();
        break;
      case 'import-json':
        this.importFromJSON();
        break;
      case 'import-musicxml':
        this.importMusicXML();
        break;
      case 'export-dialog':
        this.openExportDialog();
        break;
      case 'set-title':
        this.setTitle();
        break;
      case 'set-composer':
        this.setComposer();
        break;
      case 'set-tonic':
        this.setTonic();
        break;
      case 'set-pitch-system':
        this.setPitchSystem();
        break;
      case 'set-key-signature':
        this.setKeySignature();
        break;
      case 'set-constraints':
        this.setConstraints();
        break;
      case 'undo':
        this.editor.handleUndo();
        break;
      case 'redo':
        this.editor.handleRedo();
        break;
      case 'copy':
        this.editor.handleCopy();
        break;
      case 'cut':
        this.editor.handleCut();
        break;
      case 'paste':
        this.editor.handlePaste();
        break;
      case 'toggle-ornament-edit-mode':
        await this.editor.toggleOrnamentEditMode();
        break;
      case 'ornament-position-before':
        this.setOrnamentPosition('before');
        break;
      case 'ornament-position-ontop':
        this.setOrnamentPosition('ontop');
        break;
      case 'ornament-position-after':
        this.setOrnamentPosition('after');
        break;
      case 'ornament-selection-to-ornament':
        await this.selectionToOrnament();
        break;
      case 'ornament-copy':
        this.copyOrnament();
        break;
      case 'ornament-paste':
        this.pasteOrnament();
        break;
      case 'ornament-clear':
        this.clearOrnament();
        break;
      case 'apply-slur':
        await this.applySlur();
        break;
      case 'octave-highest':
        await this.applyOctave(2);
        break;
      case 'octave-upper':
        await this.applyOctave(1);
        break;
      case 'octave-middle':
        await this.applyOctave(0);
        break;
      case 'octave-lower':
        await this.applyOctave(-1);
        break;
      case 'octave-lowest':
        await this.applyOctave(-2);
        break;
      case 'select-all':
        this.selectAll();
        break;
      case 'set-label':
        this.setLabel();
        break;
      case 'set-line-tonic':
        this.setLineTonic();
        break;
      case 'set-line-pitch-system':
        this.setLinePitchSystem();
        break;
      case 'set-lyrics':
        this.setLyrics();
        break;
      case 'set-tala':
        this.setTala();
        break;
      case 'set-line-key-signature':
        this.setLineKeySignature();
        break;
      case 'preferences':
        this.openPreferences();
        break;
      default:
        logger.warn(LOG_CATEGORIES.UI, 'Unknown menu action', { action });
    }
  }

  /**
     * Create new document
     */
  async newDocument() {
    logger.debug(LOG_CATEGORIES.UI, 'newDocument() called');
    logger.debug(LOG_CATEGORIES.UI, 'fileOperations available', { available: !!this.fileOperations });

    // Use FileOperations if available (includes pitch system prompt)
    if (this.fileOperations) {
      logger.info(LOG_CATEGORIES.UI, 'Using FileOperations.newFile()');
      await this.fileOperations.newFile();
      this.setupLineMenu();
      return;
    }

    // Fallback to direct editor method (no pitch system prompt)
    logger.warn(LOG_CATEGORIES.UI, 'Falling back to editor.createNewDocument()');
    if (this.editor) {
      try {
        await this.editor.createNewDocument();
        logger.info(LOG_CATEGORIES.FILE, 'Created new document');
        this.setupLineMenu();
      } catch (error) {
        logger.error(LOG_CATEGORIES.UI, 'Failed to create new document', { error });
      }
    }
  }

  /**
     * Open document from file
     */
  async openDocument() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (file) {
        try {
          const text = await file.text();
          await this.editor.loadDocument(text);
          this.updateDocumentTitle(file.name);
          logger.info(LOG_CATEGORIES.FILE, `Opened document: ${file.name}`);
        } catch (error) {
          logger.error(LOG_CATEGORIES.UI, 'Failed to open document', { error });
        }
      }
    };

    input.click();
  }

  /**
     * Save document to file
     */
  async saveDocument() {
    if (this.editor) {
      try {
        const documentState = await this.editor.saveDocument();
        const blob = new Blob([documentState], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.getDocumentTitle()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        logger.info(LOG_CATEGORIES.FILE, `Document saved: ${this.getDocumentTitle()}.json`);
      } catch (error) {
        logger.error(LOG_CATEGORIES.UI, 'Failed to save document', { error });
      }
    }
  }

  /**
     * Open the export dialog
     */
  openExportDialog() {
    if (this.editor && this.editor.exportUI) {
      this.editor.exportUI.open();
    } else {
      logger.error(LOG_CATEGORIES.UI, 'Export UI not available');
    }
  }

  /**
   * Open preferences dialog
   */
  openPreferences() {
    if (this.preferencesUI) {
      this.preferencesUI.open();
    } else {
      logger.error(LOG_CATEGORIES.UI, 'Preferences UI not available');
    }
  }

  /**
     * Show stub message
     */
  showStubMessage(feature) {
    alert(feature);
  }

  /**
     * Set document title
     */
  async setTitle() {
    const currentTitle = this.getDocumentTitle();
    const newTitle = prompt('Enter document title:', currentTitle);

    if (newTitle !== null) {
      this.updateDocumentTitle(newTitle);

      if (this.editor && this.editor.getDocument() && this.editor.wasmModule) {
        // Call WASM setTitle function
        try {
          await this.editor.wasmModule.setTitle(newTitle);
          this.editor.addToConsoleLog(`Document title set to: ${newTitle}`);
          await this.editor.renderAndUpdate();
        } catch (error) {
          logger.error(LOG_CATEGORIES.WASM, 'Failed to set title via WASM', { error });
        }
      }
    }
  }

  /**
     * Set document composer
     */
  async setComposer() {
    const currentComposer = this.getComposer();
    const newComposer = prompt('Enter composer name:', currentComposer);

    if (newComposer !== null && newComposer.trim() !== '') {
      if (this.editor && this.editor.getDocument() && this.editor.wasmModule) {
        // Call WASM setComposer function
        try {
          this.editor.wasmModule.loadDocument(updatedDocument);
          logger.info(LOG_CATEGORIES.WASM, `Composer set to: ${newComposer}`);
          await this.editor.render(); // Re-render to show composer on canvas
        } catch (error) {
          logger.error(LOG_CATEGORIES.WASM, 'Failed to set composer via WASM', { error });
        }
      }
    }
  }

  /**
     * Set tonic
     */
  async setTonic() {
    const currentTonic = this.getTonic();
    const newTonic = prompt('Enter tonic (C, D, E, F, G, A, B):', currentTonic);

    if (newTonic !== null && newTonic.trim() !== '') {
      this.updateTonicDisplay(newTonic);

      if (this.editor && this.editor.wasmModule) {
        this.editor.wasmModule.setDocumentTonic(newTonic);
        logger.info(LOG_CATEGORIES.WASM, `Document tonic set to: ${newTonic}`);
        await this.editor.renderAndUpdate();
      }
    }
  }

  /**
     * Set pitch system
     */
  async setPitchSystem() {
    logger.info(LOG_CATEGORIES.UI, 'setPitchSystem called');
    const currentSystem = this.getCurrentPitchSystem();
    logger.debug(LOG_CATEGORIES.UI, 'Current system', { currentSystem });
    const newSystem = this.showPitchSystemDialog(currentSystem);
    logger.debug(LOG_CATEGORIES.UI, 'New system selected', { newSystem });

    if (newSystem !== null && newSystem !== currentSystem) {
      logger.info(LOG_CATEGORIES.UI, 'Updating pitch system...');
      if (this.editor && this.editor.wasmModule) {
        try {
          // Call WASM function to set pitch system (Phase 1 - uses internal DOCUMENT)
          logger.debug(LOG_CATEGORIES.WASM, 'Calling WASM setDocumentPitchSystem', { newSystem });
          await this.editor.wasmModule.setDocumentPitchSystem(newSystem);
          logger.debug(LOG_CATEGORIES.WASM, 'WASM setDocumentPitchSystem completed');

          logger.info(LOG_CATEGORIES.WASM, `Document pitch system set to: ${this.getPitchSystemName(newSystem)}`);
          logger.debug(LOG_CATEGORIES.UI, 'Rendering after document pitch system change...');
          await this.editor.renderAndUpdate();
          logger.debug(LOG_CATEGORIES.UI, 'Render complete');
          this.editor.updateCurrentPitchSystemDisplay(); // Update UI
        } catch (error) {
          logger.error(LOG_CATEGORIES.UI, 'Failed to set pitch system', { error });
        }
      }
    }
  }

  /**
     * Show pitch system selection dialog
     */
  showPitchSystemDialog(currentSystem) {
    const options = {
      1: 'Number (1-7)',
      2: 'Western (cdefgab/CDEFGAB)',
      3: 'Sargam (S, R, G, M, P, D, N)'
    };

    const message = Object.entries(options)
      .map(([value, label]) => `${value}. ${label}`)
      .join('\n');

    const choice = prompt(`Select pitch system (1-3):\n\n${message}\n\nCurrent: ${options[currentSystem] || '1'}`, currentSystem?.toString());

    if (choice !== null && choice.trim() !== '') {
      const system = parseInt(choice);
      if (system >= 1 && system <= 3) {
        return system;
      }
    }

    return null;
  }

  /**
     * Set key signature (document-level)
     */
  async setKeySignature() {
    if (this.keySignatureSelector) {
      const currentSignature = this.getKeySignature();
      this.keySignatureSelector.open('document', currentSignature);
    } else {
      // Fallback to prompt if selector not loaded yet
      const currentSignature = this.getKeySignature();
      const newSignature = prompt('Enter key signature (e.g., C major, G major, etc.):', currentSignature);

      if (newSignature !== null && newSignature.trim() !== '') {
        this.updateKeySignatureDisplay(newSignature);

        if (this.editor && this.editor.getDocument()) {
          this.editor.getDocument().key_signature = newSignature;
          logger.info(LOG_CATEGORIES.UI, `Document key signature set to: ${newSignature}`);
          await this.editor.renderAndUpdate();

          // Update the display in corner
          this.updateKeySignatureCornerDisplay();
        }
      }
    }
  }

  /**
   * Open the constraints dialog
   */
  async setConstraints() {
    if (this.constraintsDialog) {
      await this.constraintsDialog.open();
    } else {
      logger.error(LOG_CATEGORIES.UI, 'ConstraintsDialog not initialized');
    }
  }

  /**
   * Setup mode toggle button event listeners
   */
  setupModeToggleButton() {
    const modeBtn = document.getElementById('mode-toggle-btn');
    if (!modeBtn) {
      logger.warn(LOG_CATEGORIES.UI, 'Mode toggle button not found');
      return;
    }

    // Single click = toggle constraint on/off
    modeBtn.addEventListener('click', this.handleModeToggleClick.bind(this));

    // Double click = open constraints dialog
    modeBtn.addEventListener('dblclick', this.handleModeToggleDblClick.bind(this));

    logger.info(LOG_CATEGORIES.UI, 'Mode toggle button initialized');
  }

  /**
   * Handle single click on mode toggle button (toggle constraint on/off)
   */
  async handleModeToggleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    // Check if there's an active constraint
    const wasmModule = this.editor.wasmModule;
    if (!wasmModule || typeof wasmModule.getActiveConstraint !== 'function') {
      logger.warn(LOG_CATEGORIES.WASM, 'WASM module not ready');
      return;
    }

    const activeConstraintId = wasmModule.getActiveConstraint();
    if (!activeConstraintId) {
      // No constraint selected - open dialog
      await this.setConstraints();
      return;
    }

    // Toggle enabled state
    this.constraintEnabled = !this.constraintEnabled;
    logger.info(LOG_CATEGORIES.UI, `Constraint ${this.constraintEnabled ? 'enabled' : 'disabled'}`);

    // Update display
    this.updateModeToggleDisplay();
  }

  /**
   * Handle double click on mode toggle button (open dialog)
   */
  async handleModeToggleDblClick(event) {
    event.preventDefault();
    event.stopPropagation();

    // Open constraints dialog
    await this.setConstraints();
  }

  /**
   * Update mode toggle button display
   * Call this when document changes or constraint is selected/changed
   */
  updateModeToggleDisplay() {
    const modeBtn = document.getElementById('mode-toggle-btn');
    const modeText = document.getElementById('mode-toggle-text');

    if (!modeBtn || !modeText) {
      return;
    }

    // Get active constraint from WASM
    const wasmModule = this.editor.wasmModule;
    if (!wasmModule || typeof wasmModule.getActiveConstraint !== 'function') {
      return;
    }

    const activeConstraintId = wasmModule.getActiveConstraint();

    if (!activeConstraintId) {
      // No constraint active
      modeBtn.className = 'mode-toggle-btn';
      modeBtn.title = 'No constraint active (double-click to select)';
      modeText.textContent = 'Mode: None';
      this.constraintEnabled = true; // Reset state
      return;
    }

    // Get constraint details
    let constraintName = 'Unknown';
    try {
      const constraints = wasmModule.getPredefinedConstraints();
      const constraint = constraints.find(c => c.id === activeConstraintId);
      if (constraint) {
        constraintName = constraint.name;
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Error getting constraint details', { error });
    }

    // Update display based on enabled state
    if (this.constraintEnabled) {
      // Active state
      modeBtn.className = 'mode-toggle-btn active';
      modeBtn.title = `Constrain to ${constraintName} (click to disable, double-click to change)`;
      modeText.textContent = constraintName;
    } else {
      // Inactive state (selected but disabled)
      modeBtn.className = 'mode-toggle-btn inactive';
      modeBtn.title = `${constraintName} (disabled - click to enable, double-click to change)`;
      modeText.textContent = constraintName;
    }
  }

  /**
   * Check if constraint filtering is currently active
   * Used by KeyboardHandler to determine if pitch should be filtered
   */
  isConstraintActive() {
    return this.constraintEnabled && this.editor.wasmModule?.getActiveConstraint();
  }

  /**
   * Update the key signature display in the upper left corner
   */
  updateKeySignatureCornerDisplay() {
    try {
      // Get the current key signature (document or line level)
      const docSig = this.getKeySignature();
      const lineSig = this.getLineKeySignature();
      const keySignature = docSig || lineSig;

      logger.debug(LOG_CATEGORIES.UI, `updateKeySignatureCornerDisplay`, { docSig, lineSig, final: keySignature });

      // Create click handler that opens the key signature selector
      const clickHandler = () => {
        if (this.keySignatureSelector) {
          const currentSig = this.getKeySignature() || this.getLineKeySignature();
          this.keySignatureSelector.open('document', currentSig);
        }
      };

      // Call the display update function directly (already imported at top of file)
      updateKeySigDisplay(keySignature, clickHandler);
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Failed to update key signature display', { error });
    }
  }

  /**
   * Select all cells in the current line (same as triple-click)
   * Uses WASM to handle selection logic
   */
  async selectAll() {
    if (!this.editor || !this.editor.getDocument()) {
      logger.warn(LOG_CATEGORIES.UI, 'Cannot select all: editor or document not available');
      return;
    }

    try {
      // Ensure WASM has the latest document state
      this.editor.wasmModule.loadDocument(this.editor.getDocument());

      // Get current cursor position to determine which line
      const lineIndex = this.editor.getDocument().state.cursor.line || 0;
      const col = this.editor.getDocument().state.cursor.col || 0;

      // Call WASM to select entire line
      const pos = { line: lineIndex, col: col };
      const diff = this.editor.wasmModule.selectLineAtPosition(pos);

      // Update UI from WASM state
      await this.editor.updateCursorFromWASM(diff);

      logger.info(LOG_CATEGORIES.UI, 'Selected entire line', { lineIndex });
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Select all error', { error });
    }
  }

  /**
     * Set line label
     */
  async setLabel() {
    const currentLabel = this.getLineLabel();
    const newLabel = prompt('Enter line label:', currentLabel);

    if (newLabel !== null && newLabel.trim() !== '') {
      this.updateLineLabelDisplay(newLabel);

      if (this.editor && this.editor.getDocument() && this.editor.getDocument().lines.length > 0 && this.editor.wasmModule) {
        // Call WASM setLineLabel function (modern WASM-First API)
        try {
          const lineIdx = this.getCurrentLineIndex();
          this.editor.wasmModule.setLineLabel(lineIdx, newLabel);
          logger.info(LOG_CATEGORIES.WASM, `Line label set to: ${newLabel}`);
          await this.editor.renderAndUpdate();
        } catch (error) {
          logger.error(LOG_CATEGORIES.WASM, 'Failed to set label via WASM', { error });
        }
      }
    }
  }

  /**
     * Set line tonic
     */
  async setLineTonic() {
    const currentTonic = this.getLineTonic();
    const newTonic = prompt('Enter line tonic (C, D, E, F, G, A, B):', currentTonic);

    if (newTonic !== null && newTonic.trim() !== '') {
      this.updateLineTonicDisplay(newTonic);

      if (this.editor && this.editor.wasmModule && this.editor.getDocument() && this.editor.getDocument().lines.length > 0) {
        const lineIdx = this.getCurrentLineIndex();
        this.editor.wasmModule.setLineTonic(lineIdx, newTonic);
        logger.info(LOG_CATEGORIES.WASM, `Line tonic set to: ${newTonic}`);
        await this.editor.renderAndUpdate();
      }
    }
  }

  /**
     * Set line pitch system
     */
  async setLinePitchSystem() {
    // Check if document has lines
    if (!this.editor || !this.editor.getDocument() || this.editor.getDocument().lines.length === 0) {
      alert('No lines in document. Please add content first.');
      return;
    }

    const currentSystem = this.getLinePitchSystem();
    const newSystem = this.showPitchSystemDialog(currentSystem);

    if (newSystem !== null && newSystem !== currentSystem) {
      if (this.editor && this.editor.getDocument() && this.editor.wasmModule) {
        try {
          // Call WASM function to set line pitch system (modern WASM-First API)
          const lineIdx = this.getCurrentLineIndex();
          this.editor.wasmModule.setLinePitchSystem(lineIdx, newSystem);

          logger.info(LOG_CATEGORIES.WASM, `Line pitch system set to: ${this.getPitchSystemName(newSystem)}`);
          logger.debug(LOG_CATEGORIES.UI, 'Rendering after line pitch system change...');
          await this.editor.renderAndUpdate();
          logger.debug(LOG_CATEGORIES.UI, 'Render complete');
          this.editor.updateCurrentPitchSystemDisplay(); // Update UI
        } catch (error) {
          logger.error(LOG_CATEGORIES.UI, 'Failed to set line pitch system', { error });
        }
      }
    }
  }

  /**
     * Set lyrics
     */
  async setLyrics() {
    const currentLyrics = this.getLyrics();
    const newLyrics = prompt('Enter lyrics:', currentLyrics);

    // Allow empty string to clear lyrics - all validation and updates handled in WASM
    if (newLyrics !== null) {
      if (this.editor && this.editor.getDocument() && this.editor.getDocument().lines.length > 0 && this.editor.wasmModule) {
        // Call WASM setLineLyrics function (modern WASM-First API, handles empty string to clear)
        try {
          const lineIdx = this.getCurrentLineIndex();
          this.editor.wasmModule.setLineLyrics(lineIdx, newLyrics);
          const displayMsg = newLyrics === '' ? 'Lyrics cleared' : `Lyrics set to: ${newLyrics}`;
          logger.info(LOG_CATEGORIES.WASM, displayMsg);
          await this.editor.renderAndUpdate();
        } catch (error) {
          logger.error(LOG_CATEGORIES.WASM, 'Failed to set lyrics via WASM', { error });
        }
      }
    }
  }

  /**
     * Set tala
     */
  async setTala() {
    const currentTala = this.getTala();
    const newTala = prompt('Enter tala (digits 0-9+ or empty to clear):', currentTala);

    // Allow empty string to clear tala
    if (newTala !== null) {
      // Validate tala input (empty is allowed to clear)
      if (newTala === '' || this.validateTalaInput(newTala)) {
        this.updateTalaDisplay(newTala);

        if (this.editor) {
          await this.editor.setTala(newTala);
        }
      } else {
        logger.error(LOG_CATEGORIES.UI, 'Invalid tala format. Only digits 0-9 and + are allowed.');
      }
    }
  }

  /**
     * Validate tala input
     */
  validateTalaInput(tala) {
    return /^[0-9+]*$/.test(tala);
  }

  /**
     * Set line key signature
     */
  /**
   * Set line key signature (line-level)
   */
  async setLineKeySignature() {
    if (this.keySignatureSelector) {
      const currentSignature = this.getLineKeySignature();
      this.keySignatureSelector.open('line', currentSignature);
    } else {
      // Fallback to prompt if selector not loaded yet
      const currentSignature = this.getLineKeySignature();
      const newSignature = prompt('Enter line key signature:', currentSignature);

      if (newSignature !== null && newSignature.trim() !== '') {
        this.updateLineKeySignatureDisplay(newSignature);

        if (this.editor && this.editor.getDocument() && this.editor.getDocument().lines.length > 0) {
          const lineIdx = this.getCurrentLineIndex();
          this.editor.getDocument().lines[lineIdx].key_signature = newSignature;
          logger.info(LOG_CATEGORIES.UI, `Line key signature set to: ${newSignature}`);
          await this.editor.renderAndUpdate();

          // Update the display in corner
          this.updateKeySignatureCornerDisplay();
        }
      }
    }
  }

  /**
   * Close all menus
   */
  closeAllMenus() {
    const menus = document.querySelectorAll('[id$="-menu"]');
    menus.forEach(menu => {
      menu.classList.add('hidden');
    });

    const buttons = document.querySelectorAll('[id$="-menu-button"]');
    buttons.forEach(button => {
      button.classList.remove('bg-ui-active');
    });

    this.activeMenu = null;
  }

  /**
     * Return focus to editor element
     */
  returnFocusToEditor() {
    // Focus immediately so keyboard input works right away
    const editorElement = document.getElementById('notation-editor');
    if (!editorElement) return;

    // Set focus immediately
    editorElement.focus({ preventScroll: true });

    // Also verify focus is set after a microtask (backup for edge cases)
    Promise.resolve().then(() => {
      if (document.activeElement !== editorElement) {
        editorElement.focus({ preventScroll: true });
      }
    });
  }

  /**
     * Handle outside clicks
     */
  handleOutsideClick(event) {
    // Check if click is outside menu buttons and menu dropdowns
    const isMenuButton = event.target.closest('[id$="-menu-button"]');
    const isMenuDropdown = event.target.closest('[id$="-menu"]');

    if (!isMenuButton && !isMenuDropdown && this.activeMenu) {
      this.closeAllMenus();
      // Always return focus to editor when closing menus via outside click
      this.returnFocusToEditor();
    }
  }

  /**
     * Handle keyboard navigation in menus
     */
  handleMenuKeyboard(event) {
    if (!this.activeMenu) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closeAllMenus();
        this.returnFocusToEditor();
        break;
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.navigateMenu('down');
        break;
      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.navigateMenu('up');
        break;
      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.activateCurrentMenuItem();
        break;
    }
  }

  /**
     * Navigate menu items
     */
  navigateMenu(direction) {
    const menu = document.getElementById(`${this.activeMenu}-menu`);
    if (!menu) return;

    const items = Array.from(menu.querySelectorAll('.menu-item:not([style*="display: none"])'));
    const activeItem = menu.querySelector('.menu-item:hover, .menu-item.active');

    let currentIndex = activeItem ? items.indexOf(activeItem) : -1;

    if (direction === 'down') {
      currentIndex = (currentIndex + 1) % items.length;
    } else if (direction === 'up') {
      currentIndex -= 1;
      if (currentIndex < 0) currentIndex = items.length - 1;
    }

    // Remove hover from all items
    items.forEach(item => item.classList.remove('hover'));

    // Add hover to new item
    items[currentIndex]?.classList.add('hover');
    items[currentIndex]?.focus();
  }

  /**
     * Activate current menu item
     */
  activateCurrentMenuItem() {
    const activeItem = document.querySelector('.menu-item.hover, .menu-item.active');
    if (activeItem) {
      activeItem.click();
    }
  }

  /**
     * Update UI displays
     */
  updateCurrentPitchSystemDisplay() {
    const system = this.getCurrentPitchSystem();
    const systemName = this.getPitchSystemName(system);

    const displayElement = document.getElementById(DOM_SELECTORS.PITCH_SYSTEM);
    if (displayElement) {
      displayElement.textContent = systemName;
    }
  }

  /**
     * Update document title display
     */
  updateDocumentTitle(title) {
    const titleElement = document.getElementById('composition-title');
    if (titleElement) {
      titleElement.textContent = title;
    }

    document.title = `${title} - Music Notation Editor`;
  }

  /**
   * Get current active line index from editor cursor
   */
  getCurrentLineIndex() {
    if (this.editor && typeof this.editor.getCurrentStave === 'function') {
      return this.editor.getCurrentStave();
    }
    // Fallback to line 0 if editor or method not available
    return 0;
  }

  /**
     * Getters
     */
  getDocumentTitle() {
    return this.editor?.getDocument()?.title || 'Untitled Document';
  }

  getComposer() {
    return this.editor?.getDocument()?.composer || '';
  }

  getTonic() {
    return this.editor?.getDocument()?.tonic || '';
  }

  getCurrentPitchSystem() {
    return this.editor?.getDocument()?.pitch_system || 1;
  }

  getKeySignature() {
    return this.editor?.getDocument()?.key_signature || '';
  }

  getLineLabel() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.getDocument()?.lines?.length > lineIdx) {
      return this.editor.getDocument().lines[lineIdx].label || '';
    }
    return '';
  }

  getLineTonic() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.getDocument()?.lines?.length > lineIdx) {
      return this.editor.getDocument().lines[lineIdx].tonic || '';
    }
    return '';
  }

  getLinePitchSystem() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.getDocument()?.lines?.length > lineIdx) {
      return this.editor.getDocument().lines[lineIdx].pitch_system || 1;
    }
    return 1;
  }

  getLyrics() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.getDocument()?.lines?.length > lineIdx) {
      return this.editor.getDocument().lines[lineIdx].lyrics || '';
    }
    return '';
  }

  getTala() {
    const lineIdx = this.getCurrentLineIndex();
    const tala = this.editor?.getDocument()?.lines?.length > lineIdx
      ? this.editor.getDocument().lines[lineIdx].tala || '' : '';
    logger.debug(LOG_CATEGORIES.UI, 'getTala', { lineIdx, tala, linesLength: this.editor?.getDocument()?.lines?.length });
    logger.debug(LOG_CATEGORIES.UI, `Line[${lineIdx}]`, { line: this.editor?.getDocument()?.lines?.[lineIdx] });
    return tala;
  }

  getLineKeySignature() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.getDocument()?.lines?.length > lineIdx) {
      return this.editor.getDocument().lines[lineIdx].key_signature || '';
    }
    return '';
  }

  /**
     * Display update methods
     */
  updateTonicDisplay(tonic) {
    // This would update UI to show current tonic
    logger.debug(LOG_CATEGORIES.UI, `Tonic updated: ${tonic}`);
  }

  updateKeySignatureDisplay(signature) {
    // Update the key signature display in the upper left corner
    logger.debug(LOG_CATEGORIES.UI, `Key signature updated: ${signature}`);

    // Call the actual display update function
    const openKeySigSelector = () => {
      if (this.keySignatureSelector) {
        this.keySignatureSelector.open();
      }
    };

    updateKeySigDisplay(signature, openKeySigSelector);
  }

  updateLineLabelDisplay(label) {
    // This would update UI to show line label
    logger.debug(LOG_CATEGORIES.UI, `Line label updated: ${label}`);
  }

  updateLineTonicDisplay(tonic) {
    // This would update UI to show line tonic
    logger.debug(LOG_CATEGORIES.UI, `Line tonic updated: ${tonic}`);
  }

  updateLinePitchSystemDisplay(system) {
    // This would update UI to show line pitch system
    logger.debug(LOG_CATEGORIES.UI, `Line pitch system updated: ${this.getPitchSystemName(system)}`);
  }

  updateLyricsDisplay(lyrics) {
    // This would update UI to show lyrics
    logger.debug(LOG_CATEGORIES.UI, `Lyrics updated: ${lyrics}`);
  }

  updateTalaDisplay(tala) {
    // This would update UI to show tala notation
    logger.debug(LOG_CATEGORIES.UI, `Tala updated: ${tala}`);
  }

  updateLineKeySignatureDisplay(signature) {
    // This would update UI to show line key signature
    logger.debug(LOG_CATEGORIES.UI, `Line key signature updated: ${signature}`);
  }

  /**
     * Apply slur to current selection (delegates to keyboard handler)
     */
  async applySlur() {
    if (this.editor && this.editor.keyboardHandler) {
      await this.editor.keyboardHandler._applySlurLayered();
    }
  }

  /**
     * Apply octave to current selection (delegates to keyboard handler)
     */
  async applyOctave(octave) {
    if (this.editor && this.editor.keyboardHandler) {
      await this.editor.keyboardHandler._applyOctaveLayered(octave);
    }
  }

  /**
   * Save document to browser localStorage
   */
  async saveToStorage() {
    if (!this.editor) {
      alert('No editor available');
      return;
    }

    const name = prompt('Enter document name:');
    if (name === null) return; // User cancelled

    try {
      const success = await this.editor.storage.saveDocument(name);
      if (success) {
        logger.info(LOG_CATEGORIES.STORAGE, `Document saved to storage: "${name}"`);
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to save to storage', { error });
    }
  }

  /**
   * Load document from browser localStorage
   */
  async loadFromStorage() {
    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      const saved = this.editor.storage.getSavedDocuments();

      if (saved.length === 0) {
        alert('No saved documents found in storage');
        return;
      }

      // Create a list of saved documents for the user to choose from
      const names = saved.map((s, i) => `${i + 1}. ${s.name} (${s.title})`).join('\n');
      const selectedName = prompt(`Select a document to load:\n\n${names}\n\nEnter document name:`, saved[0].name);

      if (selectedName === null) return; // User cancelled

      const success = await this.editor.storage.loadDocument(selectedName);
      if (success) {
        logger.info(LOG_CATEGORIES.STORAGE, `Document loaded from storage: "${selectedName}"`);
        this.setupLineMenu();
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to load from storage', { error });
    }
  }

  /**
   * Export document as JSON file
   */
  async exportAsJSON() {
    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      const filename = prompt('Enter filename (without .json):', this.getDocumentTitle());
      if (filename === null) return; // User cancelled

      await this.editor.storage.exportAsJSON(filename);
      logger.info(LOG_CATEGORIES.FILE, `Document exported as JSON: "${filename}.json"`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to export as JSON', { error });
    }
  }

  /**
   * Import document from JSON file
   */
  async importFromJSON() {
    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      const success = await this.editor.storage.importFromJSON();
      if (success) {
        logger.info(LOG_CATEGORIES.FILE, 'Document imported from JSON');
        this.setupLineMenu();
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to import from JSON', { error });
    }
  }

  /**
   * Open a file (JSON, MusicXML, or text)
   */
  async openFile() {
    if (!this.fileOperations) {
      alert('File operations not available');
      return;
    }

    try {
      await this.fileOperations.openFile();
      this.setupLineMenu();
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to open file', { error });
    }
  }

  /**
   * Export document as MusicXML file
   */
  async exportMusicXML() {
    if (!this.editor || !this.editor.wasmModule) {
      alert('Editor or WASM module not available');
      return;
    }

    try {
      const filename = prompt('Enter filename (without .musicxml):', this.getDocumentTitle());
      if (filename === null) return; // User cancelled

      logger.info(LOG_CATEGORIES.FILE, 'Exporting MusicXML...');

      // Call WASM exportMusicXML function
      const musicxml = this.editor.wasmModule.exportMusicXML(this.editor.getDocument());

      logger.info(LOG_CATEGORIES.FILE, 'MusicXML exported successfully');

      // Create blob and download
      const blob = new Blob([musicxml], { type: 'application/vnd.recordare.musicxml+xml' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.musicxml`;
      a.click();

      URL.revokeObjectURL(url);
      logger.info(LOG_CATEGORIES.FILE, `MusicXML exported: "${filename}.musicxml"`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to export MusicXML', { error });
    }
  }

  /**
   * Import MusicXML file
   */
  async importMusicXML() {
    if (!this.editor || !this.editor.wasmModule) {
      alert('Editor or WASM module not available');
      return;
    }

    try {
      // Create file input
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.musicxml,.xml';
      fileInput.style.display = 'none';

      fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (file) {
          try {
            const text = await file.text();

            logger.info(LOG_CATEGORIES.FILE, 'Importing MusicXML', { filename: file.name });

            // Call WASM importMusicXML function
            const document = this.editor.wasmModule.importMusicXML(text);

            logger.info(LOG_CATEGORIES.FILE, 'MusicXML imported successfully');

            // Set title from filename if not set
            if (document && !document.title) {
              document.title = file.name.replace(/\.(musicxml|xml)$/i, '');
            }

            // Load the imported document
            await this.editor.loadDocument(document);

            logger.info(LOG_CATEGORIES.FILE, `MusicXML imported: "${file.name}"`);
            this.setupLineMenu();
          } catch (error) {
            logger.error(LOG_CATEGORIES.FILE, 'Failed to import MusicXML', { error });
            alert(`Failed to import MusicXML: ${error.message}`);
          }
        }
        document.body.removeChild(fileInput);
      });

      document.body.appendChild(fileInput);
      fileInput.click();
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to import MusicXML', { error });
    }
  }

  /**
     * Helper: Get pitch system name
     */
  getPitchSystemName(system) {
    const names = {
      1: 'Number',
      2: 'Western',
      3: 'Sargam'
    };
    return names[system] || 'Unknown';
  }

  /**
     * Helper: Convert string to snake_case
     */
  toSnakeCase(str) {
    return str
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s-]+/g, '_')  // Replace spaces and hyphens with underscore
      .replace(/_+/g, '_')      // Replace multiple underscores with single
      .replace(/^_|_$/g, '');   // Remove leading/trailing underscores
  }

  /**
   * Ornament Copy/Paste Methods
   */

  /**
   * Set ornament position and update menu checkmarks
   */
  setOrnamentPosition(position) {
    logger.debug(LOG_CATEGORIES.UI, 'setOrnamentPosition', { position });

    // Store pending position for next paste
    this.pendingOrnamentPosition = position;

    // Update menu checkmarks (radio-style)
    const beforeItem = document.getElementById('menu-ornament-before');
    const ontopItem = document.getElementById('menu-ornament-ontop');
    const afterItem = document.getElementById('menu-ornament-after');

    if (beforeItem && ontopItem && afterItem) {
      const beforeCheck = beforeItem.querySelector('.menu-checkbox');
      const ontopCheck = ontopItem.querySelector('.menu-checkbox');
      const afterCheck = afterItem.querySelector('.menu-checkbox');

      // Clear all checkmarks
      if (beforeCheck) beforeCheck.textContent = '  ';
      if (ontopCheck) ontopCheck.textContent = '  ';
      if (afterCheck) afterCheck.textContent = '  ';

      // Set checkmark on selected position
      if (position === 'before' && beforeCheck) {
        beforeCheck.textContent = '✓ ';
      } else if (position === 'ontop' && ontopCheck) {
        ontopCheck.textContent = '✓ ';
      } else if (position === 'after' && afterCheck) {
        afterCheck.textContent = '✓ ';
      }
    }

    // If there's a selected cell with an ornament, update its placement
    // Cells-array pattern (like octave operations)
    if (this.editor) {
      try {
        const cursor = this.editor.getDocument().state.cursor;
        const line = this.editor.getDocument().lines[cursor.line];

        // Effective selection logic: cursor.col - 1
        if (cursor.col > 0 && cursor.col - 1 < line.cells.length) {
          const cellIndex = cursor.col - 1;

          // Call WASM with cells array + cell_index + placement (cells-array pattern)
          const updatedCells = this.editor.wasmModule.setOrnamentPlacementOnCell(
            line.cells,
            cellIndex,
            position
          );

          // Update line.cells with modified array (same as octave operations)
          line.cells = updatedCells;

          // Render
          this.editor.renderAndUpdate();
          logger.info(LOG_CATEGORIES.UI, `Ornament position set to: ${position}`);
        }
      } catch (error) {
        // Ornament doesn't exist yet, that's okay - position will be used for next paste
        logger.debug(LOG_CATEGORIES.UI, 'No ornament to update position', { message: error.message });
      }
    }
  }

  /**
   * Copy ornament from selected cell
   *
   * KISS logic: Store the cell and its ornament in the object clipboard.
   * - JS calculates cell_index from cursor position
   * - JS stores the cell in this.clipboard.cells (same as regular cell copy)
   * When pasted, the ornament property of this cell will replace the target's ornament
   */
  async copyOrnament() {
    console.log('[UI] copyOrnament');

    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      // Get cursor position and calculate target cell index
      const cursor = this.editor.getDocument().state.cursor;
      const line = this.editor.getDocument().lines[cursor.line];

      // Effective selection logic: cursor.col - 1
      if (cursor.col === 0) {
        alert('No cell selected (cursor at start of line)');
        return;
      }

      const cellIndex = cursor.col - 1;

      if (cellIndex >= line.cells.length) {
        alert('Invalid cell index');
        return;
      }

      const cell = line.cells[cellIndex];

      // Get ornament data from annotation layer (text-first architecture)
      const ornamentResult = this.editor.wasmModule.getOrnamentAt(cursor.line, cellIndex);

      if (!ornamentResult || !ornamentResult.notation) {
        alert('No ornament found at this position');
        return;
      }

      const notation = ornamentResult.notation;

      // Store TEXT in clipboard, not Cell object
      this.editor.clipboard.ornamentNotation = notation;
      this.editor.addToConsoleLog(`Ornament copied: ${notation}`);
    } catch (error) {
      console.error('[UI] Copy ornament error:', error);
      alert(`Failed to copy ornament: ${error.message || error}`);
    }
  }

  /**
   * Paste ornament from clipboard to selected cell (TEXT-BASED, LAYERED API)
   *
   * Uses the new layered architecture:
   * - Reads TEXT notation from clipboard
   * - Calls applyOrnamentLayered() which stores in annotation layer
   * - Renders (which calls applyAnnotationOrnamentsToCells() to sync)
   */
  async pasteOrnament() {
    console.log('[UI] pasteOrnament');

    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      const doc = this.editor.getDocument();
      const cursor = doc.state.cursor;
      const selection = doc.state.selection_manager?.current_selection;

      let notation;
      let targetCol;

      // Check if there's a selection
      if (selection && selection.anchor && selection.head) {
        console.log('[UI] Selection detected, using selected text as ornament');

        // Get the selected text
        const line = doc.lines[cursor.line];
        const start = Math.min(selection.anchor.col, selection.head.col);
        const end = Math.max(selection.anchor.col, selection.head.col);

        // Extract selected text from cells
        const selectedText = line.cells
          .slice(start, end)
          .map(cell => cell.char)
          .join('');

        console.log(`[UI] Selected text: "${selectedText}" (cols ${start}-${end})`);

        if (!selectedText || selectedText.trim().length === 0) {
          alert('No text selected');
          return;
        }

        notation = selectedText;

        // Target is the note BEFORE the selection
        // If selection starts at col 0, can't apply ornament
        if (start === 0) {
          alert('Cannot apply ornament: selection starts at beginning of line');
          return;
        }

        targetCol = start - 1; // The cell before the selection

        console.log(`[UI] Applying ornament "${notation}" to col ${targetCol}`);
      } else {
        // No selection - use clipboard
        notation = this.editor.clipboard.ornamentNotation;
        if (!notation) {
          alert('No ornament in clipboard and no text selected');
          return;
        }

        // Effective selection logic: cursor.col - 1
        if (cursor.col === 0) {
          alert('No cell selected (cursor at start of line)');
          return;
        }

        targetCol = cursor.col - 1;
      }

      const placement = this.pendingOrnamentPosition || 'after';
      const col = targetCol;

      // Call layered API with TEXT notation
      const result = await this.editor.wasmModule.applyOrnamentLayered(
        cursor.line,
        col,
        notation,
        placement
      );

      console.log('[UI] applyOrnamentLayered result:', result);

      if (!result.success) {
        alert(`Failed to apply ornament: ${result.error || 'Unknown error'}`);
        return;
      }

      // Render (will call applyAnnotationOrnamentsToCells() to sync)
      await this.editor.renderAndUpdate();
      this.editor.addToConsoleLog(`Ornament pasted: ${notation} (${placement})`);
    } catch (error) {
      console.error('[UI] Paste ornament error:', error);
      alert(`Failed to paste ornament: ${error.message || error}`);
    }
  }

  /**
   * Clear ornament from selected cell (LAYERED API)
   *
   * Uses the new layered architecture:
   * - Calls removeOrnamentLayered() which removes from annotation layer
   * - Renders (which calls applyAnnotationOrnamentsToCells() to sync)
   */
  async clearOrnament() {
    console.log('[UI] clearOrnament');

    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      // Get cursor position
      const cursor = this.editor.getDocument().state.cursor;

      // Effective selection logic: cursor.col - 1
      if (cursor.col === 0) {
        alert('No cell selected (cursor at start of line)');
        return;
      }

      const col = cursor.col - 1;

      // Call layered API to remove ornament
      const result = await this.editor.wasmModule.removeOrnamentLayered(cursor.line, col);

      console.log('[UI] removeOrnamentLayered result:', result);

      if (!result.success) {
        // Not necessarily an error - just means no ornament was there
        console.log('No ornament to remove');
      }

      // Render (will call applyAnnotationOrnamentsToCells() to sync)
      await this.editor.renderAndUpdate();
      this.editor.addToConsoleLog('Ornament cleared');
    } catch (error) {
      console.error('[UI] Clear ornament error:', error);
      alert(`Failed to clear ornament: ${error.message || error}`);
    }
  }

  /**
   * Convert selected text to ornament on the preceding pitch
   * Takes the current selection, applies it as an ornament to the cell before the selection,
   * then deletes the selected text. Overwrites any existing ornament.
   */
  async selectionToOrnament() {
    console.log('[UI] selectionToOrnament');

    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      const doc = this.editor.getDocument();
      const cursor = doc.state.cursor;
      const selection = doc.state.selection_manager?.current_selection;

      // Must have a selection
      if (!selection || !selection.anchor || !selection.head) {
        alert('No text selected');
        return;
      }

      console.log('[UI] Selection detected');

      // Get the selected text
      const line = doc.lines[cursor.line];
      const start = Math.min(selection.anchor.col, selection.head.col);
      const end = Math.max(selection.anchor.col, selection.head.col);

      // Extract selected text from cells
      const selectedText = line.cells
        .slice(start, end)
        .map(cell => cell.char)
        .join('');

      console.log(`[UI] Selected text: "${selectedText}" (cols ${start}-${end})`);

      if (!selectedText || selectedText.trim().length === 0) {
        alert('No text selected');
        return;
      }

      // Target is the note BEFORE the selection
      // If selection starts at col 0, can't apply ornament
      if (start === 0) {
        alert('Cannot apply ornament: selection starts at beginning of line');
        return;
      }

      const targetCol = start - 1; // The cell before the selection
      const placement = this.pendingOrnamentPosition || 'after';

      console.log(`[UI] Applying ornament "${selectedText}" to col ${targetCol} (${placement})`);

      // Apply the ornament (overwrites existing ornament)
      const result = await this.editor.wasmModule.applyOrnamentLayered(
        cursor.line,
        targetCol,
        selectedText,
        placement
      );

      console.log('[UI] applyOrnamentLayered result:', result);

      if (!result.success) {
        alert(`Failed to apply ornament: ${result.error || 'Unknown error'}`);
        return;
      }

      // Delete the selected text
      await this.editor.deleteSelection();

      // Render (will call applyAnnotationOrnamentsToCells() to sync)
      await this.editor.renderAndUpdate();
      this.editor.addToConsoleLog(`Selection converted to ornament: ${selectedText}`);
    } catch (error) {
      console.error('[UI] Selection to ornament error:', error);
      alert(`Failed to convert selection to ornament: ${error.message || error}`);
    }
  }
}

export default UI;
