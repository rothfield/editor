/**
 * Key Signature Selector - Circle of Fifths Interface
 * Provides a visual interface for selecting key signatures
 */

import logger, { LOG_CATEGORIES } from './logger.js';

interface UI {
  editor?: {
    wasmModule?: {
      setDocumentKeySignature: (key: string) => void;
      setLineKeySignature: (lineIndex: number, key: string) => void;
    };
    element?: HTMLElement;
    getDocument: () => { state: { cursor: { line: number } } } | null;
    addToConsoleLog: (message: string) => void;
    renderAndUpdate: () => Promise<void>;
    forceUpdateAllExports: () => Promise<void>;
  };
  updateKeySignatureCornerDisplay: () => void;
}

export class KeySignatureSelector {
  private ui: UI;
  private modal: HTMLElement;
  private closeBtn: HTMLElement;
  private overlay: HTMLElement;
  private modeToggle: HTMLInputElement;
  private modeLabel: HTMLElement;
  private displayElement: HTMLElement;
  private items: NodeListOf<HTMLElement>;
  private selectedKey: string | null = null;
  private isMinorMode: boolean = false;
  private targetLevel: 'document' | 'line' = 'document';

  constructor(ui: UI) {
    this.ui = ui;
    this.modal = document.getElementById('key-signature-modal')!;
    this.closeBtn = document.getElementById('key-sig-close')!;
    this.overlay = this.modal.querySelector('.key-sig-overlay')!;
    this.modeToggle = document.getElementById('key-sig-mode') as HTMLInputElement;
    this.modeLabel = document.getElementById('key-sig-mode-label')!;
    this.displayElement = document.getElementById('key-sig-display')!;
    this.items = this.modal.querySelectorAll<HTMLElement>('.key-sig-item');

    this.bindEvents();
  }

  bindEvents(): void {
    // Close button
    this.closeBtn.addEventListener('click', () => this.close());

    // Overlay click to close
    this.overlay.addEventListener('click', () => this.close());

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });

    // Mode toggle (Major/Minor)
    this.modeToggle.addEventListener('change', () => {
      this.isMinorMode = this.modeToggle.checked;
      this.modeLabel.textContent = this.isMinorMode ? 'Show Minor Keys' : 'Show Major Keys';
      this.updateDisplay();
    });

    // Key signature item clicks
    this.items.forEach(item => {
      item.addEventListener('click', () => this.selectKey(item));
    });
  }

  /**
   * Open the modal for document-level or line-level key signature selection
   */
  open(level: 'document' | 'line' = 'document', currentKey: string | null = null): void {
    this.targetLevel = level;
    this.modal.classList.remove('hidden');

    // Set initial selection if there's a current key
    if (currentKey) {
      this.setCurrentKey(currentKey);
    } else {
      this.selectedKey = null;
      this.updateDisplay();
    }

    // Reset to major mode by default
    this.isMinorMode = false;
    this.modeToggle.checked = false;
    this.modeLabel.textContent = 'Show Major Keys';
  }

  close(): void {
    this.modal.classList.add('hidden');

    // Restore focus to editor
    if (this.ui.editor && this.ui.editor.element) {
      this.ui.editor.element.focus({ preventScroll: true });
    }
  }

  setCurrentKey(keyString: string): void {
    // Parse key string to determine if it's major or minor
    const isMinor = keyString.toLowerCase().includes('minor');
    this.isMinorMode = isMinor;
    this.modeToggle.checked = isMinor;
    this.modeLabel.textContent = isMinor ? 'Show Minor Keys' : 'Show Major Keys';

    // Find matching item
    const matchingItem = Array.from(this.items).find(item => {
      const majorKey = item.dataset.key;
      const minorKey = item.dataset.minor;
      return majorKey === keyString || minorKey === keyString;
    });

    if (matchingItem) {
      this.selectedKey = isMinor ? matchingItem.dataset.minor! : matchingItem.dataset.key!;
      this.highlightSelected();
      this.updateDisplay();
    }
  }

  selectKey(item: HTMLElement): void {
    // Get the appropriate key based on mode
    const key = this.isMinorMode ? item.dataset.minor : item.dataset.key;
    this.selectedKey = key || null;

    // Update UI
    this.highlightSelected();
    this.updateDisplay();

    // Apply the key signature
    this.applyKeySignature();

    // Close the modal after a short delay for visual feedback
    setTimeout(() => this.close(), 300);
  }

  highlightSelected(): void {
    this.items.forEach(item => {
      const majorKey = item.dataset.key;
      const minorKey = item.dataset.minor;

      if (majorKey === this.selectedKey || minorKey === this.selectedKey) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  updateDisplay(): void {
    if (this.selectedKey) {
      this.displayElement.textContent = this.selectedKey;
    } else {
      this.displayElement.textContent = 'None';
    }
  }

  async applyKeySignature(): Promise<void> {
    if (!this.selectedKey) return;

    if (this.targetLevel === 'document') {
      // Apply to document level
      if (this.ui.editor && this.ui.editor.wasmModule) {
        // Use WASM API to set key signature (WASM is source of truth)
        this.ui.editor.wasmModule.setDocumentKeySignature(this.selectedKey);
        this.ui.editor.addToConsoleLog(`Document key signature set to: ${this.selectedKey}`);

        await this.ui.editor.renderAndUpdate();

        // IMMEDIATELY update all export tabs (MusicXML, LilyPond, IR)
        // regardless of which tab is currently visible
        await this.ui.editor.forceUpdateAllExports();

        // Update the display via UI method (includes click handler)
        this.ui.updateKeySignatureCornerDisplay();
      }
    } else if (this.targetLevel === 'line') {
      // Apply to line level
      if (this.ui.editor && this.ui.editor.wasmModule) {
        const doc = this.ui.editor.getDocument();
        const lineIndex = doc?.state.cursor.line || 0;

        // Use WASM API to set line key signature (WASM is source of truth)
        this.ui.editor.wasmModule.setLineKeySignature(lineIndex, this.selectedKey);
        this.ui.editor.addToConsoleLog(`Line ${lineIndex} key signature set to: ${this.selectedKey}`);

        await this.ui.editor.renderAndUpdate();

        // IMMEDIATELY update all export tabs (MusicXML, LilyPond, IR)
        // regardless of which tab is currently visible
        await this.ui.editor.forceUpdateAllExports();

        // Update the display via UI method (includes click handler)
        this.ui.updateKeySignatureCornerDisplay();
      }
    }
  }
}

/**
 * Map key signature name to SVG filename
 */
function getKeySVGFilename(keySignature: string): string | null {
  // Map of key signatures to their SVG filenames
  const keyMap: Record<string, string> = {
    'C major': 'C-major_a-minor.svg',
    'A minor': 'C-major_a-minor.svg',
    'G major': 'G-major_e-minor.svg',
    'E minor': 'G-major_e-minor.svg',
    'D major': 'D-major_b-minor.svg',
    'B minor': 'D-major_b-minor.svg',
    'A major': 'A-major_f-sharp-minor.svg',
    'F-sharp minor': 'A-major_f-sharp-minor.svg',
    'F# minor': 'A-major_f-sharp-minor.svg',
    'E major': 'E-major_c-sharp-minor.svg',
    'C-sharp minor': 'E-major_c-sharp-minor.svg',
    'C# minor': 'E-major_c-sharp-minor.svg',
    'B major': 'B-major_g-sharp-minor.svg',
    'G-sharp minor': 'B-major_g-sharp-minor.svg',
    'G# minor': 'B-major_g-sharp-minor.svg',
    'F-sharp major': 'F-sharp-major_d-sharp-minor.svg',
    'F# major': 'F-sharp-major_d-sharp-minor.svg',
    'D-sharp minor': 'F-sharp-major_d-sharp-minor.svg',
    'D# minor': 'F-sharp-major_d-sharp-minor.svg',
    'G-flat major': 'G-flat-major_e-flat-minor.svg',
    'Gb major': 'G-flat-major_e-flat-minor.svg',
    'E-flat minor': 'G-flat-major_e-flat-minor.svg',
    'Eb minor': 'G-flat-major_e-flat-minor.svg',
    'D-flat major': 'D-flat-major_b-flat-minor.svg',
    'Db major': 'D-flat-major_b-flat-minor.svg',
    'B-flat minor': 'D-flat-major_b-flat-minor.svg',
    'Bb minor': 'D-flat-major_b-flat-minor.svg',
    'A-flat major': 'A-flat-major_f-minor.svg',
    'Ab major': 'A-flat-major_f-minor.svg',
    'F minor': 'A-flat-major_f-minor.svg',
    'E-flat major': 'E-flat-major_c-minor.svg',
    'Eb major': 'E-flat-major_c-minor.svg',
    'C minor': 'E-flat-major_c-minor.svg',
    'B-flat major': 'B-flat-major_g-minor.svg',
    'Bb major': 'B-flat-major_g-minor.svg',
    'G minor': 'B-flat-major_g-minor.svg',
    'F major': 'F-major_d-minor.svg',
    'D minor': 'F-major_d-minor.svg',
  };

  return keyMap[keySignature] || null;
}

/**
 * Update the key signature display in the upper left corner
 */
export function updateKeySignatureDisplay(keySignature: string, onClickCallback: EventListener | null = null): void {
  logger.debug(LOG_CATEGORIES.UI, `updateKeySignatureDisplay called`, { keySignature });

  const displayElement = document.getElementById('key-signature-display') as HTMLElement | null;
  const svgElement = document.getElementById('key-sig-display-svg') as HTMLImageElement | null;

  if (!displayElement || !svgElement) {
    logger.warn(LOG_CATEGORIES.UI, 'Display elements not found');
    return;
  }

  if (keySignature && keySignature.trim() !== '') {
    // Get the SVG filename for this key signature
    const svgFilename = getKeySVGFilename(keySignature);
    logger.debug(LOG_CATEGORIES.UI, `SVG filename: ${svgFilename}`);

    if (svgFilename) {
      // Show the display and set the SVG source
      svgElement.src = `key-signatures/${svgFilename}`;
      svgElement.alt = keySignature;
      displayElement.title = `${keySignature} (click to change)`;
      displayElement.classList.remove('hidden');
      logger.debug(LOG_CATEGORIES.UI, `Display shown for ${keySignature}`);

      // Setup click handler if provided
      if (onClickCallback && !displayElement.dataset.hasClickHandler) {
        displayElement.addEventListener('click', onClickCallback);
        displayElement.dataset.hasClickHandler = 'true';
      }
    } else {
      // Unknown key signature, hide the display
      logger.warn(LOG_CATEGORIES.UI, `No SVG found for key signature: ${keySignature}`);
      displayElement.classList.add('hidden');
    }
  } else {
    // Hide the display if no key signature
    logger.debug(LOG_CATEGORIES.UI, `No key signature provided, hiding display`);
    displayElement.classList.add('hidden');
  }
}

/**
 * Initialize the key signature selector
 * Call this after the DOM is loaded
 */
export function initKeySignatureSelector(ui: UI): KeySignatureSelector {
  return new KeySignatureSelector(ui);
}
