/**
 * UI Components for Music Notation Editor
 *
 * This class provides UI components including menu system,
 * tab management, and user interface elements for the Music Notation Editor.
 */

class UI {
  constructor(editor, fileOperations = null) {
    this.editor = editor;
    this.fileOperations = fileOperations;
    this.activeMenu = null;
    this.activeTab = 'staff-notation';
    this.menuListeners = new Map();

    // localStorage settings
    this.tabSaveDebounceMs = 2000;
    this.tabSaveTimeout = null;

    // Bind methods
    this.handleMenuToggle = this.handleMenuToggle.bind(this);
    this.handleMenuItemClick = this.handleMenuItemClick.bind(this);
    this.handleTabClick = this.handleTabClick.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
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
    this.syncOrnamentEditModeUI();

    console.log('UI components initialized');
  }

  /**
   * Sync ornament edit mode UI with document state
   */
  syncOrnamentEditModeUI() {
    if (this.editor && this.editor.wasmModule && this.editor.theDocument) {
      try {
        const mode = this.editor.wasmModule.getOrnamentEditMode(this.editor.theDocument);
        this.updateOrnamentEditModeCheckbox(mode);

        // Update header display
        const headerDisplay = document.getElementById('ornament-edit-mode-display');
        if (headerDisplay) {
          headerDisplay.textContent = `Edit Ornament Mode: ${mode ? 'ON' : 'OFF'}`;
        }
      } catch (e) {
        // WASM function not available yet, will sync later
        console.log('Ornament edit mode sync skipped (WASM not ready)');
      }
    }
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
  }

  /**
     * Setup File menu
     */
  setupFileMenu() {
    const menuItems = [
      { id: 'menu-new', label: 'New', action: 'new-document' },
      { id: 'menu-save-to-storage', label: 'Save to Storage...', action: 'save-to-storage' },
      { id: 'menu-load-from-storage', label: 'Load from Storage...', action: 'load-from-storage' },
      { id: 'menu-separator-1', label: null, separator: true },
      { id: 'menu-export-json', label: 'Export as JSON...', action: 'export-json' },
      { id: 'menu-import-json', label: 'Import from JSON...', action: 'import-json' },
      { id: 'menu-separator-2', label: null, separator: true },
      { id: 'menu-set-title', label: 'Set Title...', action: 'set-title' },
      { id: 'menu-set-composer', label: 'Set Composer...', action: 'set-composer' },
      { id: 'menu-set-tonic', label: 'Set Tonic...', action: 'set-tonic' },
      { id: 'menu-set-pitch-system', label: 'Set Pitch System...', action: 'set-pitch-system' },
      { id: 'menu-set-key-signature', label: 'Set Key Signature...', action: 'set-key-signature' }
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
      { id: 'menu-ornament', label: 'Ornament...', action: 'ornament' },
      { id: 'menu-apply-slur', label: 'Apply Slur (Alt+S)', action: 'apply-slur' },
      { id: 'menu-edit-ornaments', label: 'Edit Ornaments (Alt+Shift+O)', action: 'edit-ornaments', checkable: true },
      { id: 'menu-separator-1', label: null, separator: true },
      { id: 'menu-octave-upper', label: 'Upper Octave (Alt+U)', action: 'octave-upper' },
      { id: 'menu-octave-middle', label: 'Middle Octave (Alt+M)', action: 'octave-middle' },
      { id: 'menu-octave-lower', label: 'Lower Octave (Alt+L)', action: 'octave-lower' }
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

        if (item.checkable) {
          // Add checkbox indicator for checkable items
          const checkbox = document.createElement('span');
          checkbox.className = 'menu-checkbox';
          checkbox.textContent = '☐ '; // Empty checkbox
          checkbox.dataset.checked = 'false';
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
    const menuItems = [
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
      const menuItem = document.createElement('div');
      menuItem.id = item.id;
      menuItem.className = 'menu-item';
      menuItem.dataset.action = item.action;
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', this.handleMenuItemClick);
      lineMenu.appendChild(menuItem);
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

    // Set initial active tab
    this.switchTab('staff-notation');
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
  handleMenuItemClick(event) {
    const menuItem = event.target.closest('.menu-item');
    if (!menuItem) return;

    const action = menuItem.dataset.action;
    if (!action) return;

    // Prevent event from propagating and interfering with editor events
    event.preventDefault();
    event.stopPropagation();

    this.executeMenuAction(action);

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

    // Save tab preference to localStorage with debounce
    this.scheduleTabSave();

    // Render staff notation if switching to staff notation tab
    if (tabName === 'staff-notation' && this.editor) {
      await this.editor.renderStaffNotation();
    }

    // Request focus return to editor
    this.returnFocusToEditor();
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
      console.log(`[Tab Preference] Saved active tab: ${this.activeTab}`);
    } catch (error) {
      console.error('Failed to save tab preference to localStorage:', error);
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
          console.log(`[Tab Preference] Restored active tab: ${savedTab}`);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to restore tab preference from localStorage:', error);
    }

    // Fallback to default tab if nothing was saved or restoration failed
    this.switchTab('staff-notation');
  }

  /**
     * Execute menu action
     */
  executeMenuAction(action) {
    switch (action) {
      case 'new-document':
        this.newDocument();
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
      case 'import-json':
        this.importFromJSON();
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
      case 'ornament':
        this.openOrnamentEditor();
        break;
      case 'edit-ornaments':
        this.toggleOrnamentEditMode();
        break;
      case 'apply-slur':
        this.applySlur();
        break;
      case 'octave-upper':
        this.applyOctave(1);
        break;
      case 'octave-middle':
        this.applyOctave(0);
        break;
      case 'octave-lower':
        this.applyOctave(-1);
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
      default:
        console.log('Unknown menu action:', action);
    }
  }

  /**
     * Create new document
     */
  async newDocument() {
    console.log('🔵 UI.newDocument() called');
    console.log('🔍 fileOperations available?', !!this.fileOperations);

    // Use FileOperations if available (includes pitch system prompt)
    if (this.fileOperations) {
      console.log('✅ Using FileOperations.newFile()');
      await this.fileOperations.newFile();
      return;
    }

    // Fallback to direct editor method (no pitch system prompt)
    console.log('⚠️ Falling back to editor.createNewDocument()');
    if (this.editor) {
      try {
        await this.editor.createNewDocument();
        this.editor.addToConsoleLog('Created new document');
      } catch (error) {
        console.error('Failed to create new document:', error);
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
          this.editor.addToConsoleLog(`Opened document: ${file.name}`);
        } catch (error) {
          console.error('Failed to open document:', error);
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
        this.editor.addToConsoleLog(`Document saved: ${this.getDocumentTitle()}.json`);
      } catch (error) {
        console.error('Failed to save document:', error);
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
      console.error('Export UI not available');
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

      if (this.editor && this.editor.theDocument && this.editor.wasmModule) {
        // Call WASM setTitle function
        try {
          // Preserve the state field and beats array before WASM call
          const preservedState = this.editor.theDocument.state;
          const preservedBeats = this.editor.theDocument.lines.map(line => line.beats);

          const updatedDocument = await this.editor.wasmModule.setTitle(this.editor.theDocument, newTitle);

          // Restore the state field and beats array after WASM call
          updatedDocument.state = preservedState;
          updatedDocument.lines.forEach((line, index) => {
            line.beats = preservedBeats[index];
          });

          this.editor.theDocument = updatedDocument;
          this.editor.addToConsoleLog(`Document title set to: ${newTitle}`);
          await this.editor.render(); // Re-render to show title on canvas
        } catch (error) {
          console.error('Failed to set title via WASM:', error);
          this.editor.addToConsoleLog(`Error setting title: ${error.message}`);
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
      if (this.editor && this.editor.theDocument && this.editor.wasmModule) {
        // Call WASM setComposer function
        try {
          // Preserve the state field and beats array before WASM call
          const preservedState = this.editor.theDocument.state;
          const preservedBeats = this.editor.theDocument.lines.map(line => line.beats);

          const updatedDocument = await this.editor.wasmModule.setComposer(this.editor.theDocument, newComposer);

          // Restore the state field and beats array after WASM call
          updatedDocument.state = preservedState;
          updatedDocument.lines.forEach((line, index) => {
            line.beats = preservedBeats[index];
          });

          this.editor.theDocument = updatedDocument;
          this.editor.addToConsoleLog(`Composer set to: ${newComposer}`);
          await this.editor.render(); // Re-render to show composer on canvas
        } catch (error) {
          console.error('Failed to set composer via WASM:', error);
          this.editor.addToConsoleLog(`Error setting composer: ${error.message}`);
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

      if (this.editor && this.editor.theDocument) {
        this.editor.theDocument.tonic = newTonic;
        this.editor.addToConsoleLog(`Document tonic set to: ${newTonic}`);
        await this.editor.renderAndUpdate();
      }
    }
  }

  /**
     * Set pitch system
     */
  async setPitchSystem() {
    console.log('🎵 setPitchSystem called');
    const currentSystem = this.getCurrentPitchSystem();
    console.log('🎵 Current system:', currentSystem);
    const newSystem = this.showPitchSystemDialog(currentSystem);
    console.log('🎵 New system selected:', newSystem);

    if (newSystem !== null && newSystem !== currentSystem) {
      console.log('🎵 Updating pitch system...');
      if (this.editor && this.editor.theDocument && this.editor.wasmModule) {
        try {
          // Preserve the state field and beats array before WASM call
          const preservedState = this.editor.theDocument.state;
          const preservedBeats = this.editor.theDocument.lines.map(line => line.beats);

          // Call WASM function to set pitch system
          console.log('🎵 Calling WASM setDocumentPitchSystem with system:', newSystem);
          const updatedDocument = await this.editor.wasmModule.setDocumentPitchSystem(
            this.editor.theDocument,
            newSystem
          );
          console.log('🎵 WASM returned updated document:', updatedDocument?.pitch_system);

          // Restore the state field and beats array after WASM call
          updatedDocument.state = preservedState;
          updatedDocument.lines.forEach((line, index) => {
            line.beats = preservedBeats[index];
          });

          // Update the editor's document reference
          this.editor.theDocument = updatedDocument;

          this.editor.addToConsoleLog(`Document pitch system set to: ${this.getPitchSystemName(newSystem)}`);
          console.log('🎨 Rendering after document pitch system change...');
          await this.editor.renderAndUpdate();
          console.log('🎨 Render complete');
          this.editor.updateCurrentPitchSystemDisplay(); // Update UI
        } catch (error) {
          console.error('Failed to set pitch system:', error);
          this.editor.showError('Failed to set pitch system');
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
     * Set key signature
     */
  async setKeySignature() {
    const currentSignature = this.getKeySignature();
    const newSignature = prompt('Enter key signature (e.g., C, G, D major, etc.):', currentSignature);

    if (newSignature !== null && newSignature.trim() !== '') {
      this.updateKeySignatureDisplay(newSignature);

      if (this.editor && this.editor.theDocument) {
        this.editor.theDocument.key_signature = newSignature;
        this.editor.addToConsoleLog(`Document key signature set to: ${newSignature}`);
        await this.editor.renderAndUpdate();
      }
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

      if (this.editor && this.editor.theDocument && this.editor.theDocument.lines.length > 0 && this.editor.wasmModule) {
        // Call WASM setStaveLabel function
        try {
          // Preserve the state field and beats array before WASM call
          const preservedState = this.editor.theDocument.state;
          const preservedBeats = this.editor.theDocument.lines.map(line => line.beats);

          const lineIdx = this.getCurrentLineIndex();
          const updatedDocument = await this.editor.wasmModule.setLineLabel(this.editor.theDocument, lineIdx, newLabel);

          // Restore the state field and beats array after WASM call
          updatedDocument.state = preservedState;
          updatedDocument.lines.forEach((line, index) => {
            line.beats = preservedBeats[index];
          });

          this.editor.theDocument = updatedDocument;
          this.editor.addToConsoleLog(`Line label set to: ${newLabel}`);
          await this.editor.render();
        } catch (error) {
          console.error('Failed to set label via WASM:', error);
          this.editor.addToConsoleLog(`Error setting label: ${error.message}`);
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

      if (this.editor && this.editor.theDocument && this.editor.theDocument.lines.length > 0) {
        const lineIdx = this.getCurrentLineIndex();
        this.editor.theDocument.lines[lineIdx].tonic = newTonic;
        this.editor.addToConsoleLog(`Line tonic set to: ${newTonic}`);
        await this.editor.renderAndUpdate();
      }
    }
  }

  /**
     * Set line pitch system
     */
  async setLinePitchSystem() {
    // Check if document has lines
    if (!this.editor || !this.editor.theDocument || this.editor.theDocument.lines.length === 0) {
      alert('No lines in document. Please add content first.');
      return;
    }

    const currentSystem = this.getLinePitchSystem();
    const newSystem = this.showPitchSystemDialog(currentSystem);

    if (newSystem !== null && newSystem !== currentSystem) {
      if (this.editor && this.editor.theDocument && this.editor.wasmModule) {
        try {
          // Preserve the state field and beats array before WASM call
          const preservedState = this.editor.theDocument.state;
          const preservedBeats = this.editor.theDocument.lines.map(line => line.beats);

          // Call WASM function to set line pitch system
          const lineIdx = this.getCurrentLineIndex();
          const updatedDocument = await this.editor.wasmModule.setLinePitchSystem(
            this.editor.theDocument,
            lineIdx,
            newSystem
          );

          // Restore the state field and beats array after WASM call
          updatedDocument.state = preservedState;
          updatedDocument.lines.forEach((line, index) => {
            line.beats = preservedBeats[index];
          });

          // Update the editor's document reference
          this.editor.theDocument = updatedDocument;

          this.editor.addToConsoleLog(`Line pitch system set to: ${this.getPitchSystemName(newSystem)}`);
          console.log('🎨 Rendering after line pitch system change...');
          await this.editor.renderAndUpdate();
          console.log('🎨 Render complete');
          this.editor.updateCurrentPitchSystemDisplay(); // Update UI
        } catch (error) {
          console.error('Failed to set line pitch system:', error);
          this.editor.showError('Failed to set line pitch system');
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
      if (this.editor && this.editor.theDocument && this.editor.theDocument.lines.length > 0 && this.editor.wasmModule) {
        // Call WASM setLineLyrics function (handles empty string to clear)
        try {
          // Preserve the state field and beats array before WASM call
          const preservedState = this.editor.theDocument.state;
          const preservedBeats = this.editor.theDocument.lines.map(line => line.beats);

          const lineIdx = this.getCurrentLineIndex();
          const updatedDocument = await this.editor.wasmModule.setLineLyrics(this.editor.theDocument, lineIdx, newLyrics);

          // Restore the state field and beats array after WASM call
          updatedDocument.state = preservedState;
          updatedDocument.lines.forEach((line, index) => {
            line.beats = preservedBeats[index];
          });

          this.editor.theDocument = updatedDocument;
          const displayMsg = newLyrics === '' ? 'Lyrics cleared' : `Lyrics set to: ${newLyrics}`;
          this.editor.addToConsoleLog(displayMsg);
          await this.editor.render();
        } catch (error) {
          console.error('Failed to set lyrics via WASM:', error);
          this.editor.addToConsoleLog(`Error setting lyrics: ${error.message}`);
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
        console.error('Invalid tala format. Only digits 0-9 and + are allowed.');
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
  async setLineKeySignature() {
    const currentSignature = this.getLineKeySignature();
    const newSignature = prompt('Enter line key signature:', currentSignature);

    if (newSignature !== null && newSignature.trim() !== '') {
      this.updateLineKeySignatureDisplay(newSignature);

      if (this.editor && this.editor.theDocument && this.editor.theDocument.lines.length > 0) {
        const lineIdx = this.getCurrentLineIndex();
        this.editor.theDocument.lines[lineIdx].key_signature = newSignature;
        this.editor.addToConsoleLog(`Line key signature set to: ${newSignature}`);
        await this.editor.renderAndUpdate();
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
    // Use setTimeout to ensure any dialogs/prompts have closed first
    setTimeout(() => {
      const editorElement = document.getElementById('notation-editor');
      const editorContainer = document.getElementById('editor-container');
      if (editorElement) {
        editorElement.focus();
      }
    }, 50);
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
        this.closeAllMenus();
        this.returnFocusToEditor();
        break;
      case 'ArrowDown':
        this.navigateMenu('down');
        break;
      case 'ArrowUp':
        this.navigateMenu('up');
        break;
      case 'Enter':
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

    const displayElement = document.getElementById('current-pitch-system');
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
    return this.editor?.theDocument?.title || 'Untitled Document';
  }

  getComposer() {
    return this.editor?.theDocument?.composer || '';
  }

  getTonic() {
    return this.editor?.theDocument?.tonic || '';
  }

  getCurrentPitchSystem() {
    return this.editor?.theDocument?.pitch_system || 1;
  }

  getKeySignature() {
    return this.editor?.theDocument?.key_signature || '';
  }

  getLineLabel() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.theDocument?.lines?.length > lineIdx) {
      return this.editor.theDocument.lines[lineIdx].label || '';
    }
    return '';
  }

  getLineTonic() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.theDocument?.lines?.length > lineIdx) {
      return this.editor.theDocument.lines[lineIdx].tonic || '';
    }
    return '';
  }

  getLinePitchSystem() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.theDocument?.lines?.length > lineIdx) {
      return this.editor.theDocument.lines[lineIdx].pitch_system || 1;
    }
    return 1;
  }

  getLyrics() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.theDocument?.lines?.length > lineIdx) {
      return this.editor.theDocument.lines[lineIdx].lyrics || '';
    }
    return '';
  }

  getTala() {
    const lineIdx = this.getCurrentLineIndex();
    const tala = this.editor?.theDocument?.lines?.length > lineIdx
      ? this.editor.theDocument.lines[lineIdx].tala || '' : '';
    console.log(`🎯 getTala: lineIdx=${lineIdx}, tala="${tala}", lines.length=${this.editor?.theDocument?.lines?.length}`);
    console.log(`   Line[${lineIdx}]:`, this.editor?.theDocument?.lines?.[lineIdx]);
    return tala;
  }

  getLineKeySignature() {
    const lineIdx = this.getCurrentLineIndex();
    if (this.editor?.theDocument?.lines?.length > lineIdx) {
      return this.editor.theDocument.lines[lineIdx].key_signature || '';
    }
    return '';
  }

  /**
     * Display update methods
     */
  updateTonicDisplay(tonic) {
    // This would update UI to show current tonic
    console.log(`Tonic updated: ${tonic}`);
  }

  updateKeySignatureDisplay(signature) {
    // This would update UI to show current key signature
    console.log(`Key signature updated: ${signature}`);
  }

  updateLineLabelDisplay(label) {
    // This would update UI to show line label
    console.log(`Line label updated: ${label}`);
  }

  updateLineTonicDisplay(tonic) {
    // This would update UI to show line tonic
    console.log(`Line tonic updated: ${tonic}`);
  }

  updateLinePitchSystemDisplay(system) {
    // This would update UI to show line pitch system
    console.log(`Line pitch system updated: ${this.getPitchSystemName(system)}`);
  }

  updateLyricsDisplay(lyrics) {
    // This would update UI to show lyrics
    console.log(`Lyrics updated: ${lyrics}`);
  }

  updateTalaDisplay(tala) {
    // This would update UI to show tala notation
    console.log(`Tala updated: ${tala}`);
  }

  updateLineKeySignatureDisplay(signature) {
    // This would update UI to show line key signature
    console.log(`Line key signature updated: ${signature}`);
  }

  /**
     * Apply slur to current selection
     */
  applySlur() {
    if (this.editor) {
      this.editor.applySlur();
    }
  }

  /**
   * Apply ornament indicator to current selection
   */
  applyOrnamentIndicator() {
    if (this.editor) {
      this.editor.applyOrnamentIndicator();
    }
  }

  /**
   * Toggle ornament edit mode
   */
  toggleOrnamentEditMode() {
    if (this.editor) {
      this.editor.toggleOrnamentEditMode();
    }
  }

  /**
   * Update menu checkbox state for ornament edit mode
   */
  updateOrnamentEditModeCheckbox(isEnabled) {
    const menuItem = document.getElementById('menu-edit-ornaments');
    if (menuItem) {
      const checkbox = menuItem.querySelector('.menu-checkbox');
      if (checkbox) {
        checkbox.textContent = isEnabled ? '☑ ' : '☐ ';
        checkbox.dataset.checked = isEnabled.toString();
      }
    }
  }

  /**
     * Apply octave to current selection
     */
  applyOctave(octave) {
    if (this.editor) {
      this.editor.applyOctave(octave);
    }
  }

  /**
   * Open ornament editor dialog
   */
  openOrnamentEditor() {
    if (this.editor) {
      this.editor.openOrnamentEditor();
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
        this.editor.addToConsoleLog(`✅ Document saved to storage: "${name}"`);
      }
    } catch (error) {
      console.error('Failed to save to storage:', error);
      alert(`Failed to save: ${error.message}`);
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
        this.editor.addToConsoleLog(`✅ Document loaded from storage: "${selectedName}"`);
      }
    } catch (error) {
      console.error('Failed to load from storage:', error);
      alert(`Failed to load: ${error.message}`);
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
      this.editor.addToConsoleLog(`✅ Document exported as JSON: "${filename}.json"`);
    } catch (error) {
      console.error('Failed to export as JSON:', error);
      alert(`Failed to export: ${error.message}`);
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
        this.editor.addToConsoleLog('✅ Document imported from JSON');
      }
    } catch (error) {
      console.error('Failed to import from JSON:', error);
      alert(`Failed to import: ${error.message}`);
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
}

export default UI;
