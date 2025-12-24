/**
 * New Document Dialog - Professional UI with Keyboard Shortcuts
 *
 * Features:
 * - Beautiful modal design
 * - Single keystroke selection (1-4)
 * - ESC to cancel
 * - Enter to confirm
 * - Visual feedback
 */

import logger, { LOG_CATEGORIES } from './logger.js';

interface PitchSystem {
  value: string;
  name: string;
  description: string;
  example: string[];
  shortcut: string;
}

interface WASMModule {
  getAvailablePitchSystems?: () => Promise<PitchSystem[]> | PitchSystem[];
}

export class NewDocumentDialog {
  private overlay: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private selectedPitchSystem: string;
  private resolve: ((value: string | null) => void) | null = null;
  private keyboardHandler: (e: KeyboardEvent) => void;
  private currentFocusIndex: number = -1;
  private wasmModule: WASMModule | null;
  private pitchSystems: PitchSystem[] = [];

  constructor(defaultPitchSystem: string = 'number', wasmModule: WASMModule | null = null) {
    this.selectedPitchSystem = defaultPitchSystem;
    this.keyboardHandler = this.handleKeyboard.bind(this);
    this.wasmModule = wasmModule;
  }

  /**
   * Show the dialog and return a promise that resolves with the selected pitch system
   */
  async show(): Promise<string | null> {
    // Fetch pitch systems from WASM
    await this.loadPitchSystems();

    return new Promise((resolve) => {
      this.resolve = resolve;
      this.render();
      this.attachEventListeners();

      // Set initial selection state
      this.selectPitchSystem(this.selectedPitchSystem);

      // Focus the dialog for keyboard input
      setTimeout(() => {
        const firstOption = this.dialog?.querySelector<HTMLElement>('.pitch-system-option');
        if (firstOption) {
          firstOption.focus();
        }
      }, 100);
    });
  }

  /**
   * Load pitch systems from WASM
   */
  async loadPitchSystems(): Promise<void> {
    try {
      if (this.wasmModule && this.wasmModule.getAvailablePitchSystems) {
        this.pitchSystems = await this.wasmModule.getAvailablePitchSystems();
        logger.info(LOG_CATEGORIES.UI, 'Loaded pitch systems from WASM', { pitchSystems: this.pitchSystems });
      } else {
        // Fallback to hardcoded systems if WASM not available
        logger.warn(LOG_CATEGORIES.WASM, 'WASM not available, using fallback pitch systems');
        this.pitchSystems = this.getFallbackPitchSystems();
      }

      // Find the index of the default selection
      this.currentFocusIndex = this.pitchSystems.findIndex(s => s.value === this.selectedPitchSystem);
      if (this.currentFocusIndex === -1) {
        this.currentFocusIndex = 0; // Fallback to first option
      }
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error loading pitch systems from WASM', { error });
      this.pitchSystems = this.getFallbackPitchSystems();
    }
  }

  /**
   * Fallback pitch systems if WASM not available
   */
  getFallbackPitchSystems(): PitchSystem[] {
    return [
      {
        value: 'number',
        name: 'Number System',
        description: '1-7 notation (Sa Re Ga Ma Pa Dha Ni)',
        example: ['1', '2', '3', '4', '5', '6', '7'],
        shortcut: '1',
      },
      {
        value: 'western',
        name: 'Western Notation',
        description: 'C D E F G A B (traditional staff notation)',
        example: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
        shortcut: '2',
      },
      {
        value: 'sargam',
        name: 'Sargam',
        description: 'S R G M P D N (Indian classical)',
        example: ['S', 'R', 'G', 'M', 'P', 'D', 'N'],
        shortcut: '3',
      },
    ];
  }

  /**
   * Render the dialog HTML
   */
  render(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'new-document-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'new-document-title');

    // Create dialog
    this.dialog = document.createElement('div');
    this.dialog.className = 'new-document-dialog';

    // Header
    const header = document.createElement('div');
    header.className = 'new-document-header';
    header.innerHTML = `
      <h2 id="new-document-title">Create New Composition</h2>
      <p>Choose a notation system for your composition</p>
    `;

    // Body
    const body = document.createElement('div');
    body.className = 'new-document-body';

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'pitch-system-options';

    // Create option elements
    this.pitchSystems.forEach((system) => {
      const option = this.createOptionElement(system);
      optionsContainer.appendChild(option);
    });

    body.appendChild(optionsContainer);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'new-document-footer';
    footer.innerHTML = `
      <div class="footer-buttons">
        <button class="dialog-button dialog-button-cancel" data-action="cancel">
          Cancel
        </button>
        <button class="dialog-button dialog-button-create" data-action="create">
          Create Composition
        </button>
      </div>
    `;

    // Assemble dialog
    this.dialog.appendChild(header);
    this.dialog.appendChild(body);
    this.dialog.appendChild(footer);
    this.overlay.appendChild(this.dialog);

    // Add to document
    document.body.appendChild(this.overlay);
  }

  /**
   * Create a single pitch system option element
   */
  createOptionElement(system: PitchSystem): HTMLElement {
    const option = document.createElement('div');
    option.className = 'pitch-system-option';
    option.setAttribute('role', 'radio');
    option.setAttribute('tabindex', '0');
    option.setAttribute('data-value', system.value);

    // Create NotationFont example glyphs display
    const exampleGlyphs = system.example
      .map(glyph => `<span class="notation-glyph">${glyph}</span>`)
      .join(' ');

    option.innerHTML = `
      <input
        type="radio"
        name="pitch-system"
        value="${system.value}"
        id="pitch-system-${system.value}"
      >
      <div class="pitch-system-info">
        <div class="pitch-system-name">${system.name}</div>
        <div class="pitch-system-example">${exampleGlyphs}</div>
      </div>
    `;

    // Selection state will be set by selectPitchSystem() after rendering
    return option;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners(): void {
    if (!this.dialog || !this.overlay) return;

    // Radio input change - the only listener we need for selection
    const radios = this.dialog.querySelectorAll('input[type="radio"]');
    radios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.selectedPitchSystem = target.value;
        const index = this.pitchSystems.findIndex(s => s.value === target.value);
        if (index !== -1) {
          this.currentFocusIndex = index;
        }
        // Update ARIA and selected class (fallback for browsers without :has() support)
        const options = this.dialog!.querySelectorAll('.pitch-system-option');
        options.forEach((option) => {
          const isSelected = option.getAttribute('data-value') === target.value;
          option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
          option.classList.toggle('selected', isSelected);
        });
      });
    });

    // Click on option div - trigger the radio button
    const options = this.dialog.querySelectorAll<HTMLElement>('.pitch-system-option');
    options.forEach((option) => {
      option.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // Only trigger if not already clicking on the radio itself
        if (!(target instanceof HTMLInputElement && target.type === 'radio')) {
          const radio = option.querySelector<HTMLInputElement>('input[type="radio"]');
          if (radio) {
            radio.click();
          }
        }
      });
    });

    // Buttons
    const cancelBtn = this.dialog.querySelector('[data-action="cancel"]');
    const createBtn = this.dialog.querySelector('[data-action="create"]');

    cancelBtn?.addEventListener('click', () => this.cancel());
    createBtn?.addEventListener('click', () => this.create());

    // Overlay click (close on outside click)
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.cancel();
      }
    });

    // Keyboard shortcuts - use capture phase to catch events before editor
    document.addEventListener('keydown', this.keyboardHandler, true);
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboard(e: KeyboardEvent): void {
    // ESC to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.cancel();
      return;
    }

    // Enter to create
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.create();
      return;
    }

    // Arrow keys for navigation
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.key === 'ArrowDown') {
        this.currentFocusIndex = (this.currentFocusIndex + 1) % this.pitchSystems.length;
      } else {
        this.currentFocusIndex = (this.currentFocusIndex - 1 + this.pitchSystems.length) % this.pitchSystems.length;
      }

      // Select the radio button at the new index
      const value = this.pitchSystems[this.currentFocusIndex].value;
      const radio = this.dialog?.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
      if (radio) {
        radio.checked = true;
        // Manually trigger change event
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
  }

  /**
   * Select a pitch system
   */
  selectPitchSystem(value: string): void {
    this.selectedPitchSystem = value;

    // Update current focus index
    const index = this.pitchSystems.findIndex(s => s.value === value);
    if (index !== -1) {
      this.currentFocusIndex = index;
    }

    // Update radio buttons - they handle selection automatically
    const radio = this.dialog?.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`);
    if (radio) {
      radio.checked = true;
    }

    // Update ARIA attributes and selected class (fallback for browsers without :has() support)
    const options = this.dialog?.querySelectorAll('.pitch-system-option');
    options?.forEach((option) => {
      const optionValue = option.getAttribute('data-value');
      const isSelected = optionValue === value;
      option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      option.classList.toggle('selected', isSelected);
    });
  }

  /**
   * Focus a specific option by index
   */
  focusOption(index: number): void {
    const options = this.dialog?.querySelectorAll<HTMLElement>('.pitch-system-option');
    if (options && options[index]) {
      options[index].focus();
    }
  }

  /**
   * Create new document with selected pitch system
   */
  create(): void {
    this.close(this.selectedPitchSystem);
  }

  /**
   * Cancel dialog
   */
  cancel(): void {
    this.close(null);
  }

  /**
   * Close the dialog
   */
  close(result: string | null): void {
    // Remove keyboard listener - must match capture phase
    document.removeEventListener('keydown', this.keyboardHandler, true);

    // Animate close
    this.overlay?.classList.add('closing');

    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.overlay = null;
      this.dialog = null;

      // Resolve promise
      if (this.resolve) {
        this.resolve(result);
        this.resolve = null;
      }
    }, 150); // Match animation duration
  }
}

/**
 * Show the new document dialog
 */
export async function showNewDocumentDialog(defaultPitchSystem: string = 'number', wasmModule: WASMModule | null = null): Promise<string | null> {
  const dialog = new NewDocumentDialog(defaultPitchSystem, wasmModule);
  return await dialog.show();
}
