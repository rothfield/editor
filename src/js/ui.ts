/**
 * UI Components for Music Notation Editor
 *
 * This class provides UI components including menu system,
 * tab management, and user interface elements for the Music Notation Editor.
 */

import { DOM_SELECTORS } from './constants/editorConstants.js';
import { updateKeySignatureDisplay as updateKeySigDisplay } from './key-signature-selector.js';
import logger, { LOG_CATEGORIES } from './logger.js';

interface MenuItem {
  id: string;
  label: string | null;
  action?: string;
  separator?: boolean;
  testid?: string;
  checkable?: boolean;
  checked?: boolean;
}

interface DocumentConstraints {
  default_pitch_system?: number;
  enable_slurs?: boolean;
  enable_lyrics?: boolean;
  [key: string]: any;
}

interface Document {
  title?: string;
  composer?: string;
  tonic?: string;
  pitch_system?: number;
  key_signature?: string;
  lines: Line[];
  state: DocumentState;
  constraints?: DocumentConstraints;
}

interface Line {
  label?: string;
  tonic?: string;
  pitch_system?: number;
  lyrics?: string;
  tala?: string;
  key_signature?: string;
  new_system?: boolean;
  cells?: any[];
}

interface DocumentState {
  cursor: { line: number; col: number };
  selection_manager?: {
    current_selection?: {
      anchor?: { col: number };
      head?: { col: number };
    };
  };
}

interface Constraint {
  id: string;
  name: string;
  description?: string;
  category?: string;
  degrees?: number[];
}

interface WASMModule {
  setTitle: (title: string) => void;
  setComposer: (composer: string) => void;
  setDocumentTonic: (tonic: string) => void;
  setDocumentPitchSystem: (system: number) => void;
  loadDocument: (doc: Document) => void;
  selectLineAtPosition: (pos: { line: number; col: number }) => any;
  setLineLabel: (lineIdx: number, label: string) => void;
  setLineTonic: (lineIdx: number, tonic: string) => void;
  setLinePitchSystem: (lineIdx: number, system: number) => void;
  setLineLyrics: (lineIdx: number, lyrics: string) => void;
  getCursorLine?: () => number;
  getActiveConstraint?: () => string | null;
  toggleSlur: (line: number, start: number, end: number) => void;
  removeSlurLayered: (line: number, start: number, end: number) => void;
  selectionToSuperscript: (line: number, start: number, end: number) => { success: boolean; error?: string; cells_converted: number };
  superscriptToNormal: (line: number, start: number, end: number) => { success: boolean; error?: string; cells_converted: number };
  setOctave: (line: number, start: number, end: number, octave: number) => void;
  setSelection: (anchor: any, head: any) => void;
  exportMusicXML: (doc: Document) => string;
  importMusicXML: (xml: string) => Document;
  // Constraint-related methods
  getPredefinedConstraints?: () => Constraint[];
  setActiveConstraint?: (id: string) => void;
  getConstraintNotes?: (constraintId: string, pitchSystem: string) => string[];
}

interface TextareaRenderer {
  focusLine: (line: number) => void;
}

interface OSMDRenderer {
  lastMusicXmlHash: string | null;
}

interface KeyboardHandler {
  _applySlurLayered: () => Promise<void>;
  _applyOctaveLayered: (octave: number) => Promise<void>;
}

interface StorageManager {
  saveDocument: (name: string) => Promise<boolean>;
  getSavedDocuments: () => Array<{ name: string; title: string }>;
  loadDocument: (name: string) => Promise<boolean>;
  exportAsJSON: (filename: string) => Promise<void>;
  importFromJSON: () => Promise<boolean>;
}

interface ExportUI {
  open: () => void;
}

interface ClipboardCoordinator {
  copyAsAsciiMarkup: () => Promise<void>;
  copyAsPuaMarkup: () => Promise<void>;
}

interface Editor {
  wasmModule: WASMModule | null;
  textareaRenderer?: TextareaRenderer;
  osmdRenderer?: OSMDRenderer;
  keyboardHandler?: KeyboardHandler;
  storage?: StorageManager;
  exportUI?: ExportUI;
  clipboardCoordinator?: ClipboardCoordinator;
  staffNotationTimer?: number | null;
  getDocument: () => Document | null;
  getCurrentStave?: () => number;
  loadDocument: (doc: any) => Promise<void>;
  saveDocument: () => Promise<string>;
  createNewDocument: () => Promise<void>;
  renderAndUpdate: () => Promise<void>;
  render: () => Promise<void>;
  renderStaffNotation: () => Promise<void>;
  updateDocumentDisplay: () => void;
  updateCursorFromWASM: (diff: any) => Promise<void>;
  handleUndo: () => void;
  handleRedo: () => void;
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  setTala: (tala: string) => Promise<void>;
  addToConsoleLog: (msg: string) => void;
  getPitchSystemName: (system: number) => string;
  getSelection: () => { start: { line: number; col: number }; end: { line: number; col: number }; anchor: any; head: any } | null;
}

interface FileOperations {
  newFile: () => Promise<void>;
  openFile: () => Promise<void>;
}

interface PreferencesUI {
  open: () => void;
}

interface KeySignatureSelector {
  open: (level?: 'document' | 'line', currentSignature?: string | null) => void;
}

interface ConstraintsDialog {
  open: () => Promise<void>;
}

class UI {
  private editor: Editor;
  private fileOperations: FileOperations | null;
  private preferencesUI: PreferencesUI | null;
  public activeMenu: string | null;
  private activeTab: string;
  private isInitialized: boolean;
  private menuListeners: Map<string, any>;
  private keySignatureSelector: KeySignatureSelector | null;
  private constraintsDialog: ConstraintsDialog | null;
  private constraintEnabled: boolean;
  private tabSaveDebounceMs: number;
  private tabSaveTimeout: number | null;

  constructor(editor: Editor, fileOperations: FileOperations | null = null, preferencesUI: PreferencesUI | null = null) {
    this.editor = editor;
    this.fileOperations = fileOperations;
    this.preferencesUI = preferencesUI;
    this.activeMenu = null;
    this.activeTab = 'staff-notation';
    this.isInitialized = false;
    this.menuListeners = new Map();
    this.keySignatureSelector = null;
    this.constraintsDialog = null;
    this.constraintEnabled = true;
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

  initialize(): void {
    this.setupMenus();
    this.setupTabs();
    this.setupEventListeners();
    this.updateCurrentPitchSystemDisplay();
    this.restoreTabPreference();
    this.initializeKeySignatureSelector();
    this.initializeConstraintsDialog();
    this.setupModeToggleButton();

    setTimeout(() => {
      this.updateKeySignatureCornerDisplay();
      this.updateModeToggleDisplay();
    }, 500);

    this.setupTextModeToggle();
    this.isInitialized = true;

    logger.info(LOG_CATEGORIES.UI, 'UI components initialized');
  }

  setupTextModeToggle(): void {
    const sizeToggle = document.getElementById('text-size-toggle') as HTMLInputElement | null;
    const textDisplay = document.getElementById('text-display') as HTMLElement | null;
    if (sizeToggle && textDisplay) {
      sizeToggle.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        textDisplay.style.fontSize = `${target.value}px`;
      });
    }

    const fontMap: Record<string, string> = {
      'jetbrains': "'JetBrains Mono', monospace",
      'monospace': "monospace",
      'liberation': "'Liberation Mono', monospace",
      'courier': "Courier, monospace",
      'dejavu': "'DejaVu Sans Mono', monospace",
      'fira': "'Fira Code', monospace",
      'consolas': "Consolas, monospace",
      'source': "'Source Code Pro', monospace"
    };

    const sampleFontToggle = document.getElementById('text-sample-font-toggle') as HTMLSelectElement | null;
    const textSample = document.getElementById('text-sample') as HTMLElement | null;
    if (sampleFontToggle && textSample) {
      sampleFontToggle.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        const fontKey = target.value;
        textSample.style.fontFamily = fontMap[fontKey] || fontMap['jetbrains'];
      });
    }
  }

  initializeKeySignatureSelector(): void {
    import('./key-signature-selector.js').then(module => {
      this.keySignatureSelector = module.initKeySignatureSelector(this as any);
      logger.info(LOG_CATEGORIES.UI, 'Key Signature Selector initialized');
    }).catch(error => {
      logger.error(LOG_CATEGORIES.UI, 'Failed to load key signature selector', { error });
    });
  }

  initializeConstraintsDialog(): void {
    import('./ConstraintsDialog.js').then(module => {
      this.constraintsDialog = new module.ConstraintsDialog(this.editor as any);
      logger.info(LOG_CATEGORIES.UI, 'Constraints Dialog initialized');
    }).catch(error => {
      logger.error(LOG_CATEGORIES.UI, 'Failed to load constraints dialog', { error });
    });
  }

  setupMenus(): void {
    this.setupFileMenu();
    this.setupEditMenu();
    this.setupLineMenu();

    document.getElementById('file-menu-button')?.addEventListener('click', (event) => {
      this.handleMenuToggle('file', event);
    });

    document.getElementById('edit-menu-button')?.addEventListener('click', (event) => {
      this.handleMenuToggle('edit', event);
    });

    document.getElementById('line-menu-button')?.addEventListener('click', (event) => {
      this.handleMenuToggle('line', event);
    });

    const menuButtons = document.querySelectorAll('[id$="-menu-button"]');
    menuButtons.forEach(button => {
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
    });

    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
    });
  }

  setupFileMenu(): void {
    const menuItems: MenuItem[] = [
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
      { id: 'menu-export-ascii-markup', label: 'Export as ASCII Markup...', action: 'export-ascii-markup' },
      { id: 'menu-export-codepoint-markup', label: 'Export as Codepoint Markup...', action: 'export-codepoint-markup' },
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
    if (!fileMenu) return;
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
        menuItem.dataset.action = item.action || '';
        menuItem.textContent = item.label || '';
        menuItem.addEventListener('click', this.handleMenuItemClick);
        fileMenu.appendChild(menuItem);
      }
    });
  }

  setupEditMenu(): void {
    const menuItems: MenuItem[] = [
      { id: 'menu-undo', label: 'Undo (Ctrl+Z)', action: 'undo', testid: 'menu-undo' },
      { id: 'menu-redo', label: 'Redo (Ctrl+Y)', action: 'redo', testid: 'menu-redo' },
      { id: 'menu-separator-0', label: null, separator: true },
      { id: 'menu-copy', label: 'Copy (Ctrl+C)', action: 'copy', testid: 'menu-copy' },
      { id: 'menu-cut', label: 'Cut (Ctrl+X)', action: 'cut', testid: 'menu-cut' },
      { id: 'menu-paste', label: 'Paste (Ctrl+V)', action: 'paste', testid: 'menu-paste' },
      { id: 'menu-separator-1', label: null, separator: true },
      { id: 'menu-copy-ascii-markup', label: 'Copy as ASCII Markup', action: 'copy-ascii-markup', testid: 'menu-copy-ascii-markup' },
      { id: 'menu-copy-pua-markup', label: 'Copy as PUA Markup', action: 'copy-pua-markup', testid: 'menu-copy-pua-markup' },
      { id: 'menu-separator-2', label: null, separator: true },
      { id: 'menu-apply-slur', label: 'Apply Slur (Alt+S)', action: 'slur' },
      { id: 'menu-remove-slur', label: 'Remove Slurs (Alt+Shift+S)', action: 'no_slur' },
      { id: 'menu-make-superscript', label: 'Make Superscript (Alt+O)', action: 'superscript', testid: 'menu-make-superscript' },
      { id: 'menu-remove-superscript', label: 'Remove Superscripts', action: 'no_superscript', testid: 'menu-remove-superscript' },
      { id: 'menu-octave-highest', label: 'Highest Octave (Alt+H)', action: 'octave_highest' },
      { id: 'menu-octave-upper', label: 'Upper Octave (Alt+U)', action: 'octave_upper' },
      { id: 'menu-octave-middle', label: 'Middle Octave (Alt+M)', action: 'octave_middle' },
      { id: 'menu-octave-lower', label: 'Lower Octave (Alt+L)', action: 'octave_lower' },
      { id: 'menu-octave-lowest', label: 'Lowest Octave (Alt+K)', action: 'octave_lowest' }
    ];

    const editMenu = document.getElementById('edit-menu');
    if (!editMenu) return;
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
        menuItem.dataset.action = item.action || '';

        if (item.testid) {
          menuItem.dataset.testid = item.testid;
        }

        if (item.checkable) {
          const checkbox = document.createElement('span');
          checkbox.className = 'menu-checkbox';
          checkbox.textContent = item.checked ? '✓ ' : '☐ ';
          checkbox.dataset.checked = item.checked ? 'true' : 'false';
          menuItem.appendChild(checkbox);

          const label = document.createElement('span');
          label.textContent = item.label || '';
          menuItem.appendChild(label);
        } else {
          menuItem.textContent = item.label || '';
        }

        menuItem.addEventListener('click', this.handleMenuItemClick);
        editMenu.appendChild(menuItem);
      }
    });
  }

  setupLineMenu(): void {
    let currentLineNewSystem = false;
    if (this.editor && this.editor.getDocument()) {
      const doc = this.editor.getDocument()!;
      const cursor = doc.state.cursor;
      const line = doc.lines[cursor.line];
      if (line) {
        currentLineNewSystem = line.new_system || false;
      }
    }

    const menuItems: MenuItem[] = [
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
    if (!lineMenu) return;
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
        menuItem.dataset.action = item.action || '';

        if (item.checkable) {
          const checkbox = document.createElement('span');
          checkbox.className = 'menu-checkbox';
          checkbox.textContent = item.checked ? '✓ ' : '✗ ';
          checkbox.dataset.checked = item.checked ? 'true' : 'false';
          menuItem.appendChild(checkbox);

          const label = document.createElement('span');
          label.textContent = item.label || '';
          menuItem.appendChild(label);
        } else {
          menuItem.textContent = item.label || '';
        }

        menuItem.addEventListener('click', this.handleMenuItemClick);
        lineMenu.appendChild(menuItem);
      }
    });
  }

  setupTabs(): void {
    const tabButtons = document.querySelectorAll('[data-tab]');
    tabButtons.forEach(button => {
      button.addEventListener('click', this.handleTabClick);
    });
  }

  setupEventListeners(): void {
    document.addEventListener('click', this.handleOutsideClick);
    document.addEventListener('keydown', this.handleMenuKeyboard.bind(this));
  }

  handleMenuToggle(menuName: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const menu = document.getElementById(`${menuName}-menu`);
    const button = document.getElementById(`${menuName}-menu-button`);

    if (!menu || !button) return;

    if (this.activeMenu && this.activeMenu !== menuName) {
      this.closeAllMenus();
    }

    const isHidden = menu.classList.contains('hidden');

    if (isHidden) {
      if (menuName === 'line') {
        this.setupLineMenu();
      }
      menu.classList.remove('hidden');
      button.classList.add('bg-ui-active');
      this.activeMenu = menuName;
    } else {
      menu.classList.add('hidden');
      button.classList.remove('bg-ui-active');
      this.activeMenu = null;
    }
  }

  async handleMenuItemClick(event: Event): Promise<void> {
    logger.debug(LOG_CATEGORIES.UI, 'handleMenuItemClick event received');
    const target = event.target as HTMLElement;
    const menuItem = target.closest('.menu-item') as HTMLElement | null;
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

    event.preventDefault();
    event.stopPropagation();

    await this.executeMenuAction(action);
    this.closeAllMenus();
    this.returnFocusToEditor();
  }

  handleTabClick(event: Event): void {
    const target = event.target as HTMLElement;
    const tab = target.closest('[data-tab]') as HTMLElement | null;
    if (!tab) return;

    const tabName = tab.dataset.tab;
    if (tabName) {
      this.switchTab(tabName);
    }
  }

  async switchTab(tabName: string): Promise<void> {
    logger.debug(LOG_CATEGORIES.UI, `switchTab called`, { tabName });

    document.querySelectorAll('[data-tab-content]').forEach(content => {
      content.classList.add('hidden');
    });

    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.classList.remove('active');
    });

    const contentElement = document.querySelector(`[data-tab-content="${tabName}"]`);
    if (contentElement) {
      contentElement.classList.remove('hidden');
    }

    const tabElement = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabElement) {
      tabElement.classList.add('active');
    }

    this.activeTab = tabName;
    logger.debug(LOG_CATEGORIES.UI, `activeTab set`, { activeTab: this.activeTab });

    this.scheduleTabSave();

    if (tabName === 'staff-notation' && this.editor) {
      if (this.editor.staffNotationTimer) {
        clearTimeout(this.editor.staffNotationTimer);
        this.editor.staffNotationTimer = null;
      }

      if (this.editor.osmdRenderer) {
        this.editor.osmdRenderer.lastMusicXmlHash = null;
      }

      this.returnFocusToEditor();
      await new Promise(resolve => setTimeout(resolve, 50));
      await this.editor.renderStaffNotation();
    } else {
      this.returnFocusToEditor();
    }

    if (this.editor) {
      this.editor.updateDocumentDisplay();
    }
  }

  scheduleTabSave(): void {
    if (this.tabSaveTimeout) {
      clearTimeout(this.tabSaveTimeout);
    }

    this.tabSaveTimeout = window.setTimeout(() => {
      this.saveTabPreference();
      this.tabSaveTimeout = null;
    }, this.tabSaveDebounceMs);
  }

  saveTabPreference(): void {
    try {
      localStorage.setItem('editor_active_tab', this.activeTab);
      logger.info(LOG_CATEGORIES.UI, `Tab Preference: Saved active tab`, { activeTab: this.activeTab });
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Failed to save tab preference to localStorage', { error });
    }
  }

  restoreTabPreference(): void {
    try {
      const savedTab = localStorage.getItem('editor_active_tab');
      if (savedTab) {
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

    this.switchTab('staff-notation');
  }

  async executeMenuAction(action: string): Promise<void> {
    logger.debug(LOG_CATEGORIES.UI, 'executeMenuAction called', { action });
    switch (action) {
      case 'new-document':
        await this.newDocument();
        break;
      case 'open-file':
        await this.openFile();
        break;
      case 'open-document':
        await this.openDocument();
        break;
      case 'save-document':
        await this.saveDocument();
        break;
      case 'save-to-storage':
        await this.saveToStorage();
        break;
      case 'load-from-storage':
        await this.loadFromStorage();
        break;
      case 'export-json':
        await this.exportAsJSON();
        break;
      case 'export-musicxml':
        await this.exportMusicXML();
        break;
      case 'import-json':
        await this.importFromJSON();
        break;
      case 'import-musicxml':
        await this.importMusicXML();
        break;
      case 'export-ascii-markup':
        await this.exportAsASCIIMarkup();
        break;
      case 'export-codepoint-markup':
        await this.exportAsCodepointMarkup();
        break;
      case 'export-dialog':
        this.openExportDialog();
        break;
      case 'set-title':
        await this.setTitle();
        break;
      case 'set-composer':
        await this.setComposer();
        break;
      case 'set-tonic':
        await this.setTonic();
        break;
      case 'set-pitch-system':
        await this.setPitchSystem();
        break;
      case 'set-key-signature':
        await this.setKeySignature();
        break;
      case 'set-constraints':
        await this.setConstraints();
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
      case 'copy-ascii-markup':
        await this.copyAsAsciiMarkup();
        break;
      case 'copy-pua-markup':
        await this.copyAsPuaMarkup();
        break;
      case 'slur':
      case 'no_slur':
      case 'superscript':
      case 'no_superscript':
      case 'octave_highest':
      case 'octave_upper':
      case 'octave_middle':
      case 'octave_lower':
      case 'octave_lowest':
        await this.applyCommand(action);
        break;
      case 'select-all':
        await this.selectAll();
        break;
      case 'set-label':
        await this.setLabel();
        break;
      case 'set-line-tonic':
        await this.setLineTonic();
        break;
      case 'set-line-pitch-system':
        await this.setLinePitchSystem();
        break;
      case 'set-lyrics':
        await this.setLyrics();
        break;
      case 'set-tala':
        await this.setTala();
        break;
      case 'set-line-key-signature':
        await this.setLineKeySignature();
        break;
      case 'preferences':
        this.openPreferences();
        break;
      default:
        logger.warn(LOG_CATEGORIES.UI, 'Unknown menu action', { action });
    }
  }

  async newDocument(): Promise<void> {
    logger.debug(LOG_CATEGORIES.UI, 'newDocument() called');
    logger.debug(LOG_CATEGORIES.UI, 'fileOperations available', { available: !!this.fileOperations });

    if (this.fileOperations) {
      logger.info(LOG_CATEGORIES.UI, 'Using FileOperations.newFile()');
      await this.fileOperations.newFile();
      this.setupLineMenu();
      return;
    }

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

  async openDocument(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
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

  async saveDocument(): Promise<void> {
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

  openExportDialog(): void {
    if (this.editor && this.editor.exportUI) {
      this.editor.exportUI.open();
    } else {
      logger.error(LOG_CATEGORIES.UI, 'Export UI not available');
    }
  }

  openPreferences(): void {
    if (this.preferencesUI) {
      this.preferencesUI.open();
    } else {
      logger.error(LOG_CATEGORIES.UI, 'Preferences UI not available');
    }
  }

  showStubMessage(feature: string): void {
    alert(feature);
  }

  async setTitle(): Promise<void> {
    const currentTitle = this.getDocumentTitle();
    const newTitle = prompt('Enter document title:', currentTitle);

    if (newTitle !== null) {
      this.updateDocumentTitle(newTitle);

      if (this.editor && this.editor.getDocument() && this.editor.wasmModule) {
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

  async setComposer(): Promise<void> {
    const currentComposer = this.getComposer();
    const newComposer = prompt('Enter composer name:', currentComposer);

    if (newComposer !== null && newComposer.trim() !== '') {
      if (this.editor && this.editor.getDocument() && this.editor.wasmModule) {
        try {
          this.editor.wasmModule.setComposer(newComposer);
          logger.info(LOG_CATEGORIES.WASM, `Composer set to: ${newComposer}`);
          await this.editor.renderAndUpdate();
        } catch (error) {
          logger.error(LOG_CATEGORIES.WASM, 'Failed to set composer via WASM', { error });
        }
      }
    }
  }

  async setTonic(): Promise<void> {
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

  async setPitchSystem(): Promise<void> {
    logger.info(LOG_CATEGORIES.UI, 'setPitchSystem called');
    const currentSystem = this.getCurrentPitchSystem();
    logger.debug(LOG_CATEGORIES.UI, 'Current system', { currentSystem });
    const newSystem = this.showPitchSystemDialog(currentSystem);
    logger.debug(LOG_CATEGORIES.UI, 'New system selected', { newSystem });

    if (newSystem !== null && newSystem !== currentSystem) {
      logger.info(LOG_CATEGORIES.UI, 'Updating pitch system...');
      if (this.editor && this.editor.wasmModule) {
        try {
          logger.debug(LOG_CATEGORIES.WASM, 'Calling WASM setDocumentPitchSystem', { newSystem });
          await this.editor.wasmModule.setDocumentPitchSystem(newSystem);
          logger.debug(LOG_CATEGORIES.WASM, 'WASM setDocumentPitchSystem completed');

          logger.info(LOG_CATEGORIES.WASM, `Document pitch system set to: ${this.editor.getPitchSystemName(newSystem)}`);
          logger.debug(LOG_CATEGORIES.UI, 'Rendering after document pitch system change...');
          await this.editor.renderAndUpdate();
          logger.debug(LOG_CATEGORIES.UI, 'Render complete');
          this.updateCurrentPitchSystemDisplay();
        } catch (error) {
          logger.error(LOG_CATEGORIES.UI, 'Failed to set pitch system', { error });
        }
      }
    }
  }

  showPitchSystemDialog(currentSystem: number): number | null {
    const options: Record<number, string> = {
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

  async setKeySignature(): Promise<void> {
    if (this.keySignatureSelector) {
      const currentSignature = this.getKeySignature();
      this.keySignatureSelector.open('document', currentSignature);
    } else {
      const currentSignature = this.getKeySignature();
      const newSignature = prompt('Enter key signature (e.g., C major, G major, etc.):', currentSignature);

      if (newSignature !== null && newSignature.trim() !== '') {
        this.updateKeySignatureDisplay(newSignature);

        if (this.editor && this.editor.getDocument()) {
          const doc = this.editor.getDocument()!;
          doc.key_signature = newSignature;
          logger.info(LOG_CATEGORIES.UI, `Document key signature set to: ${newSignature}`);
          await this.editor.renderAndUpdate();
          this.updateKeySignatureCornerDisplay();
        }
      }
    }
  }

  async setConstraints(): Promise<void> {
    if (this.constraintsDialog) {
      await this.constraintsDialog.open();
    } else {
      logger.error(LOG_CATEGORIES.UI, 'ConstraintsDialog not initialized');
    }
  }

  setupModeToggleButton(): void {
    // Mode toggle button removed from UI
  }

  async handleModeToggleClick(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const wasmModule = this.editor.wasmModule;
    if (!wasmModule || typeof wasmModule.getActiveConstraint !== 'function') {
      logger.warn(LOG_CATEGORIES.WASM, 'WASM module not ready');
      return;
    }

    const activeConstraintId = wasmModule.getActiveConstraint();
    if (!activeConstraintId) {
      await this.setConstraints();
      return;
    }

    this.constraintEnabled = !this.constraintEnabled;
    logger.info(LOG_CATEGORIES.UI, `Constraint ${this.constraintEnabled ? 'enabled' : 'disabled'}`);
    this.updateModeToggleDisplay();
  }

  async handleModeToggleDblClick(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.setConstraints();
  }

  updateModeToggleDisplay(): void {
    // Mode toggle button removed from UI
  }

  isConstraintActive(): boolean {
    return this.constraintEnabled && !!this.editor.wasmModule?.getActiveConstraint?.();
  }

  updateKeySignatureCornerDisplay(): void {
    try {
      const docSig = this.getKeySignature();
      const lineSig = this.getLineKeySignature();
      const keySignature = docSig || lineSig;

      logger.debug(LOG_CATEGORIES.UI, `updateKeySignatureCornerDisplay`, { docSig, lineSig, final: keySignature });

      const clickHandler = () => {
        if (this.keySignatureSelector) {
          const currentSig = this.getKeySignature() || this.getLineKeySignature();
          this.keySignatureSelector.open('document', currentSig);
        }
      };

      updateKeySigDisplay(keySignature, clickHandler);
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Failed to update key signature display', { error });
    }
  }

  async selectAll(): Promise<void> {
    if (!this.editor || !this.editor.getDocument()) {
      logger.warn(LOG_CATEGORIES.UI, 'Cannot select all: editor or document not available');
      return;
    }

    try {
      const doc = this.editor.getDocument()!;
      this.editor.wasmModule!.loadDocument(doc);

      const lineIndex = doc.state.cursor.line || 0;
      const col = doc.state.cursor.col || 0;

      const pos = { line: lineIndex, col: col };
      const diff = this.editor.wasmModule!.selectLineAtPosition(pos);

      await this.editor.updateCursorFromWASM(diff);

      // Refocus the textarea to maintain selection usability
      const textarea = document.querySelector(`[data-testid="notation-textarea-${lineIndex}"]`) as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
      }

      logger.info(LOG_CATEGORIES.UI, 'Selected entire line', { lineIndex });
    } catch (error) {
      logger.error(LOG_CATEGORIES.UI, 'Select all error', { error });
    }
  }

  async setLabel(): Promise<void> {
    const currentLabel = this.getLineLabel();
    const newLabel = prompt('Enter line label:', currentLabel);

    if (newLabel !== null && newLabel.trim() !== '') {
      this.updateLineLabelDisplay(newLabel);

      if (this.editor && this.editor.getDocument() && this.editor.getDocument()!.lines.length > 0 && this.editor.wasmModule) {
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

  async setLineTonic(): Promise<void> {
    const currentTonic = this.getLineTonic();
    const newTonic = prompt('Enter line tonic (C, D, E, F, G, A, B):', currentTonic);

    if (newTonic !== null && newTonic.trim() !== '') {
      this.updateLineTonicDisplay(newTonic);

      if (this.editor && this.editor.wasmModule && this.editor.getDocument() && this.editor.getDocument()!.lines.length > 0) {
        const lineIdx = this.getCurrentLineIndex();
        this.editor.wasmModule.setLineTonic(lineIdx, newTonic);
        logger.info(LOG_CATEGORIES.WASM, `Line tonic set to: ${newTonic}`);
        await this.editor.renderAndUpdate();
      }
    }
  }

  async setLinePitchSystem(): Promise<void> {
    if (!this.editor || !this.editor.getDocument() || this.editor.getDocument()!.lines.length === 0) {
      alert('No lines in document. Please add content first.');
      return;
    }

    const currentSystem = this.getLinePitchSystem();
    const newSystem = this.showPitchSystemDialog(currentSystem);

    if (newSystem !== null && newSystem !== currentSystem) {
      if (this.editor && this.editor.getDocument() && this.editor.wasmModule) {
        try {
          const lineIdx = this.getCurrentLineIndex();
          this.editor.wasmModule.setLinePitchSystem(lineIdx, newSystem);

          logger.info(LOG_CATEGORIES.WASM, `Line pitch system set to: ${this.editor.getPitchSystemName(newSystem)}`);
          logger.debug(LOG_CATEGORIES.UI, 'Rendering after line pitch system change...');
          await this.editor.renderAndUpdate();
          logger.debug(LOG_CATEGORIES.UI, 'Render complete');
          this.updateCurrentPitchSystemDisplay();
        } catch (error) {
          logger.error(LOG_CATEGORIES.UI, 'Failed to set line pitch system', { error });
        }
      }
    }
  }

  async setLyrics(): Promise<void> {
    const currentLyrics = this.getLyrics();
    const newLyrics = prompt('Enter lyrics:', currentLyrics);

    if (newLyrics !== null) {
      if (this.editor && this.editor.getDocument() && this.editor.getDocument()!.lines.length > 0 && this.editor.wasmModule) {
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

  async setTala(): Promise<void> {
    const currentTala = this.getTala();
    const newTala = prompt('Enter tala (digits 0-9+ or empty to clear):', currentTala);

    if (newTala !== null) {
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

  validateTalaInput(tala: string): boolean {
    return /^[0-9+]*$/.test(tala);
  }

  async setLineKeySignature(): Promise<void> {
    if (this.keySignatureSelector) {
      const currentSignature = this.getLineKeySignature();
      this.keySignatureSelector.open('line', currentSignature);
    } else {
      const currentSignature = this.getLineKeySignature();
      const newSignature = prompt('Enter line key signature:', currentSignature);

      if (newSignature !== null && newSignature.trim() !== '') {
        this.updateLineKeySignatureDisplay(newSignature);

        if (this.editor && this.editor.getDocument() && this.editor.getDocument()!.lines.length > 0) {
          const lineIdx = this.getCurrentLineIndex();
          this.editor.getDocument()!.lines[lineIdx].key_signature = newSignature;
          logger.info(LOG_CATEGORIES.UI, `Line key signature set to: ${newSignature}`);
          await this.editor.renderAndUpdate();
          this.updateKeySignatureCornerDisplay();
        }
      }
    }
  }

  closeAllMenus(): void {
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

  returnFocusToEditor(): void {
    // Get current line from WASM state
    const currentLine = this.editor?.wasmModule?.getCursorLine?.() ?? 0;

    // Focus the textarea directly using DOM query
    const textarea = document.querySelector(`[data-testid="notation-textarea-${currentLine}"]`) as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      return;
    }

    // Fallback to editor container if no textarea found
    const editorElement = document.getElementById('notation-editor');
    if (!editorElement) return;

    editorElement.focus({ preventScroll: true });
  }

  handleOutsideClick(event: Event): void {
    const target = event.target as Element;
    const isMenuButton = target.closest('[id$="-menu-button"]');
    const isMenuDropdown = target.closest('[id$="-menu"]');

    if (!isMenuButton && !isMenuDropdown && this.activeMenu) {
      this.closeAllMenus();
      this.returnFocusToEditor();
    }
  }

  handleMenuKeyboard(event: KeyboardEvent): void {
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

  navigateMenu(direction: 'up' | 'down'): void {
    const menu = document.getElementById(`${this.activeMenu}-menu`);
    if (!menu) return;

    const items = Array.from(menu.querySelectorAll('.menu-item:not([style*="display: none"])')) as HTMLElement[];
    const activeItem = menu.querySelector('.menu-item:hover, .menu-item.active');

    let currentIndex = activeItem ? items.indexOf(activeItem as HTMLElement) : -1;

    if (direction === 'down') {
      currentIndex = (currentIndex + 1) % items.length;
    } else if (direction === 'up') {
      currentIndex -= 1;
      if (currentIndex < 0) currentIndex = items.length - 1;
    }

    items.forEach(item => item.classList.remove('hover'));
    items[currentIndex]?.classList.add('hover');
    items[currentIndex]?.focus();
  }

  activateCurrentMenuItem(): void {
    const activeItem = document.querySelector('.menu-item.hover, .menu-item.active') as HTMLElement | null;
    if (activeItem) {
      activeItem.click();
    }
  }

  updateCurrentPitchSystemDisplay(): void {
    // Status bar removed - pitch system display is now a no-op
  }

  updateDocumentTitle(title: string): void {
    const titleElement = document.getElementById('composition-title');
    if (titleElement) {
      titleElement.textContent = title;
    }

    document.title = `${title} - Music Notation Editor`;
  }

  getCurrentLineIndex(): number {
    if (this.editor && typeof this.editor.getCurrentStave === 'function') {
      return this.editor.getCurrentStave();
    }
    return 0;
  }

  getDocumentTitle(): string {
    return this.editor?.getDocument()?.title || 'Untitled Document';
  }

  getComposer(): string {
    return this.editor?.getDocument()?.composer || '';
  }

  getTonic(): string {
    return this.editor?.getDocument()?.tonic || '';
  }

  getCurrentPitchSystem(): number {
    return this.editor?.getDocument()?.pitch_system || 1;
  }

  getKeySignature(): string {
    return this.editor?.getDocument()?.key_signature || '';
  }

  getLineLabel(): string {
    const lineIdx = this.getCurrentLineIndex();
    const doc = this.editor?.getDocument();
    if (doc?.lines?.length && doc.lines.length > lineIdx) {
      return doc.lines[lineIdx].label || '';
    }
    return '';
  }

  getLineTonic(): string {
    const lineIdx = this.getCurrentLineIndex();
    const doc = this.editor?.getDocument();
    if (doc?.lines?.length && doc.lines.length > lineIdx) {
      return doc.lines[lineIdx].tonic || '';
    }
    return '';
  }

  getLinePitchSystem(): number {
    const lineIdx = this.getCurrentLineIndex();
    const doc = this.editor?.getDocument();
    if (doc?.lines?.length && doc.lines.length > lineIdx) {
      return doc.lines[lineIdx].pitch_system || 1;
    }
    return 1;
  }

  getLyrics(): string {
    const lineIdx = this.getCurrentLineIndex();
    const doc = this.editor?.getDocument();
    if (doc?.lines?.length && doc.lines.length > lineIdx) {
      return doc.lines[lineIdx].lyrics || '';
    }
    return '';
  }

  getTala(): string {
    const lineIdx = this.getCurrentLineIndex();
    const doc = this.editor?.getDocument();
    const tala = doc?.lines?.length && doc.lines.length > lineIdx
      ? doc.lines[lineIdx].tala || '' : '';
    logger.debug(LOG_CATEGORIES.UI, 'getTala', { lineIdx, tala, linesLength: doc?.lines?.length });
    logger.debug(LOG_CATEGORIES.UI, `Line[${lineIdx}]`, { line: doc?.lines?.[lineIdx] });
    return tala;
  }

  getLineKeySignature(): string {
    const lineIdx = this.getCurrentLineIndex();
    const doc = this.editor?.getDocument();
    if (doc?.lines?.length && doc.lines.length > lineIdx) {
      return doc.lines[lineIdx].key_signature || '';
    }
    return '';
  }

  updateTonicDisplay(tonic: string): void {
    logger.debug(LOG_CATEGORIES.UI, `Tonic updated: ${tonic}`);
  }

  updateKeySignatureDisplay(signature: string): void {
    logger.debug(LOG_CATEGORIES.UI, `Key signature updated: ${signature}`);

    const openKeySigSelector = () => {
      if (this.keySignatureSelector) {
        this.keySignatureSelector.open('document');
      }
    };

    updateKeySigDisplay(signature, openKeySigSelector);
  }

  updateLineLabelDisplay(label: string): void {
    logger.debug(LOG_CATEGORIES.UI, `Line label updated: ${label}`);
  }

  updateLineTonicDisplay(tonic: string): void {
    logger.debug(LOG_CATEGORIES.UI, `Line tonic updated: ${tonic}`);
  }

  updateLinePitchSystemDisplay(system: number): void {
    logger.debug(LOG_CATEGORIES.UI, `Line pitch system updated: ${this.editor.getPitchSystemName(system)}`);
  }

  updateLyricsDisplay(lyrics: string): void {
    logger.debug(LOG_CATEGORIES.UI, `Lyrics updated: ${lyrics}`);
  }

  updateTalaDisplay(tala: string): void {
    logger.debug(LOG_CATEGORIES.UI, `Tala updated: ${tala}`);
  }

  updateLineKeySignatureDisplay(signature: string): void {
    logger.debug(LOG_CATEGORIES.UI, `Line key signature updated: ${signature}`);
  }

  async applySlur(): Promise<void> {
    if (this.editor && this.editor.keyboardHandler) {
      await this.editor.keyboardHandler._applySlurLayered();
    }
  }

  async applyOctave(octave: number): Promise<void> {
    if (this.editor && this.editor.keyboardHandler) {
      await this.editor.keyboardHandler._applyOctaveLayered(octave);
    }
  }

  async saveToStorage(): Promise<void> {
    if (!this.editor || !this.editor.storage) {
      alert('No editor available');
      return;
    }

    const name = prompt('Enter document name:');
    if (name === null) return;

    try {
      const success = await this.editor.storage.saveDocument(name);
      if (success) {
        logger.info(LOG_CATEGORIES.STORAGE, `Document saved to storage: "${name}"`);
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to save to storage', { error });
    }
  }

  async loadFromStorage(): Promise<void> {
    if (!this.editor || !this.editor.storage) {
      alert('No editor available');
      return;
    }

    try {
      const saved = this.editor.storage.getSavedDocuments();

      if (saved.length === 0) {
        alert('No saved documents found in storage');
        return;
      }

      const names = saved.map((s, i) => `${i + 1}. ${s.name} (${s.title})`).join('\n');
      const selectedName = prompt(`Select a document to load:\n\n${names}\n\nEnter document name:`, saved[0].name);

      if (selectedName === null) return;

      const success = await this.editor.storage.loadDocument(selectedName);
      if (success) {
        logger.info(LOG_CATEGORIES.STORAGE, `Document loaded from storage: "${selectedName}"`);
        this.setupLineMenu();
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.STORAGE, 'Failed to load from storage', { error });
    }
  }

  async exportAsJSON(): Promise<void> {
    if (!this.editor || !this.editor.storage) {
      alert('No editor available');
      return;
    }

    try {
      const filename = prompt('Enter filename (without .json):', this.getDocumentTitle());
      if (filename === null) return;

      await this.editor.storage.exportAsJSON(filename);
      logger.info(LOG_CATEGORIES.FILE, `Document exported as JSON: "${filename}.json"`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to export as JSON', { error });
    }
  }

  async importFromJSON(): Promise<void> {
    if (!this.editor || !this.editor.storage) {
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

  async openFile(): Promise<void> {
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

  async exportMusicXML(): Promise<void> {
    if (!this.editor || !this.editor.wasmModule) {
      alert('Editor or WASM module not available');
      return;
    }

    try {
      const filename = prompt('Enter filename (without .musicxml):', this.getDocumentTitle());
      if (filename === null) return;

      logger.info(LOG_CATEGORIES.FILE, 'Exporting MusicXML...');

      const doc = this.editor.getDocument();
      if (!doc) {
        alert('No document to export');
        return;
      }
      const musicxml = this.editor.wasmModule.exportMusicXML(doc);

      logger.info(LOG_CATEGORIES.FILE, 'MusicXML exported successfully');

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

  async exportAsASCIIMarkup(): Promise<void> {
    if (!this.editor || !this.editor.wasmModule) {
      alert('Editor or WASM module not available');
      return;
    }

    try {
      const filename = prompt('Enter filename (without .txt):', this.getDocumentTitle());
      if (filename === null) return;

      logger.info(LOG_CATEGORIES.FILE, 'Exporting ASCII Markup...');

      const markup = this.editor.wasmModule.exportAsASCIIMarkup();

      logger.info(LOG_CATEGORIES.FILE, 'ASCII Markup exported successfully');

      const blob = new Blob([markup], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();

      URL.revokeObjectURL(url);
      logger.info(LOG_CATEGORIES.FILE, `ASCII Markup exported: "${filename}.txt"`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to export ASCII Markup', { error });
    }
  }

  async exportAsCodepointMarkup(): Promise<void> {
    if (!this.editor || !this.editor.wasmModule) {
      alert('Editor or WASM module not available');
      return;
    }

    try {
      const filename = prompt('Enter filename (without .txt):', this.getDocumentTitle());
      if (filename === null) return;

      logger.info(LOG_CATEGORIES.FILE, 'Exporting Codepoint Markup...');

      const markup = this.editor.wasmModule.exportAsCodepointMarkup();

      logger.info(LOG_CATEGORIES.FILE, 'Codepoint Markup exported successfully');

      const blob = new Blob([markup], { type: 'text/plain; charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();

      URL.revokeObjectURL(url);
      logger.info(LOG_CATEGORIES.FILE, `Codepoint Markup exported: "${filename}.txt"`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.FILE, 'Failed to export Codepoint Markup', { error });
    }
  }

  async copyAsAsciiMarkup(): Promise<void> {
    if (!this.editor || !this.editor.clipboardCoordinator) {
      logger.warn(LOG_CATEGORIES.UI, 'Editor or clipboard coordinator not available');
      return;
    }

    await this.editor.clipboardCoordinator.copyAsAsciiMarkup();
  }

  async copyAsPuaMarkup(): Promise<void> {
    if (!this.editor || !this.editor.clipboardCoordinator) {
      logger.warn(LOG_CATEGORIES.UI, 'Editor or clipboard coordinator not available');
      return;
    }

    await this.editor.clipboardCoordinator.copyAsPuaMarkup();
  }

  async importMusicXML(): Promise<void> {
    if (!this.editor || !this.editor.wasmModule) {
      alert('Editor or WASM module not available');
      return;
    }

    try {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.musicxml,.xml';
      fileInput.style.display = 'none';

      fileInput.addEventListener('change', async (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
          try {
            const text = await file.text();

            logger.info(LOG_CATEGORIES.FILE, 'Importing MusicXML', { filename: file.name });

            const document = this.editor.wasmModule!.importMusicXML(text);

            logger.info(LOG_CATEGORIES.FILE, 'MusicXML imported successfully');

            if (document && !document.title) {
              document.title = file.name.replace(/\.(musicxml|xml)$/i, '');
            }

            await this.editor.loadDocument(document);

            logger.info(LOG_CATEGORIES.FILE, `MusicXML imported: "${file.name}"`);
            this.setupLineMenu();
          } catch (error: any) {
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

  toSnakeCase(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  async selectionToSuperscript(): Promise<void> {
    console.log('[UI] selectionToSuperscript');

    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      const doc = this.editor.getDocument();
      if (!doc) {
        alert('No document');
        return;
      }
      const cursor = doc.state.cursor;
      const selection = doc.state.selection_manager?.current_selection;

      if (!selection || !selection.anchor || !selection.head) {
        alert('No text selected');
        return;
      }

      console.log('[UI] Selection detected');

      const line = cursor.line;
      const start = Math.min(selection.anchor.col, selection.head.col);
      const end = Math.max(selection.anchor.col, selection.head.col);

      console.log(`[UI] Converting cols ${start}-${end} to superscript on line ${line}`);

      const result = this.editor.wasmModule!.selectionToSuperscript(line, start, end);

      console.log('[UI] selectionToSuperscript result:', result);

      if (!result.success) {
        alert(`Failed to convert to superscript: ${result.error || 'Unknown error'}`);
        return;
      }

      if (result.cells_converted === 0) {
        alert('No pitched cells found in selection to convert');
        return;
      }

      await this.editor.renderAndUpdate();

      this.editor.wasmModule!.setSelection(selection.anchor, selection.head);
      await this.editor.render();

      this.editor.addToConsoleLog(`Converted ${result.cells_converted} note(s) to superscript`);
    } catch (error: any) {
      console.error('[UI] Selection to superscript error:', error);
      alert(`Failed to convert selection to superscript: ${error.message || error}`);
    }
  }

  async removeSuperscripts(): Promise<void> {
    console.log('[UI] removeSuperscripts');

    if (!this.editor) {
      alert('No editor available');
      return;
    }

    try {
      const doc = this.editor.getDocument();
      if (!doc) {
        alert('No document');
        return;
      }
      const cursor = doc.state.cursor;
      const selection = doc.state.selection_manager?.current_selection;

      if (!selection || !selection.anchor || !selection.head) {
        alert('No text selected');
        return;
      }

      console.log('[UI] Selection detected');

      const line = cursor.line;
      const start = Math.min(selection.anchor.col, selection.head.col);
      const end = Math.max(selection.anchor.col, selection.head.col);

      console.log(`[UI] Converting cols ${start}-${end} from superscript to normal on line ${line}`);

      const result = this.editor.wasmModule!.superscriptToNormal(line, start, end);

      console.log('[UI] superscriptToNormal result:', result);

      if (!result.success) {
        alert(`Failed to remove superscripts: ${result.error || 'Unknown error'}`);
        return;
      }

      if (result.cells_converted === 0) {
        return;
      }

      await this.editor.renderAndUpdate();

      this.editor.wasmModule!.setSelection(selection.anchor, selection.head);
      await this.editor.render();

      this.editor.addToConsoleLog(`Converted ${result.cells_converted} superscript(s) to normal notes`);
    } catch (error: any) {
      console.error('[UI] Remove superscripts error:', error);
      alert(`Failed to remove superscripts: ${error.message || error}`);
    }
  }

  getSelectionRange(): { line: number; start: number; end: number; anchor: any; head: any } | null {
    if (!this.editor) return null;

    const selection = this.editor.getSelection();
    if (!selection || selection.start.col === selection.end.col) {
      return null;
    }

    return {
      line: selection.start.line,
      start: selection.start.col,
      end: selection.end.col,
      anchor: selection.anchor,
      head: selection.head
    };
  }

  async applyCommand(cmd: string): Promise<void> {
    if (!this.editor || !this.editor.wasmModule) {
      alert('Editor not ready');
      return;
    }

    const sel = this.getSelectionRange();
    if (!sel) {
      alert('No text selected');
      return;
    }

    const { line, start, end, anchor, head } = sel;

    try {
      switch (cmd) {
        case 'slur':
          this.editor.wasmModule.toggleSlur(line, start, end);
          break;
        case 'no_slur':
          this.editor.wasmModule.removeSlurLayered(line, start, end);
          break;
        case 'superscript':
          this.editor.wasmModule.selectionToSuperscript(line, start, end);
          break;
        case 'no_superscript':
          this.editor.wasmModule.superscriptToNormal(line, start, end);
          break;
        case 'octave_highest':
          this.editor.wasmModule.setOctave(line, start, end, 2);
          break;
        case 'octave_upper':
          this.editor.wasmModule.setOctave(line, start, end, 1);
          break;
        case 'octave_middle':
          this.editor.wasmModule.setOctave(line, start, end, 0);
          break;
        case 'octave_lower':
          this.editor.wasmModule.setOctave(line, start, end, -1);
          break;
        case 'octave_lowest':
          this.editor.wasmModule.setOctave(line, start, end, -2);
          break;
        default:
          logger.warn(LOG_CATEGORIES.UI, 'Unknown selection command', { cmd });
          return;
      }

      await this.editor.renderAndUpdate();

      if (anchor && head) {
        this.editor.wasmModule.setSelection(anchor, head);
        await this.editor.render();
      }

      if (this.activeTab === 'staff-notation') {
        await this.editor.renderStaffNotation();
      }
    } catch (error: any) {
      logger.error(LOG_CATEGORIES.UI, 'Failed to apply command', { cmd, error });
      alert(`Failed to apply ${cmd}: ${error.message || error}`);
    }
  }
}

export default UI;
