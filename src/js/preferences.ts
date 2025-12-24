/**
 * Preferences UI Component
 *
 * Provides a preferences dialog for managing application settings:
 * - Show developer tabs (inspector panel visibility)
 *
 * Uses UnoCSS for styling and localStorage for persistence
 */

import logger, { LOG_CATEGORIES } from './logger.js';

interface Preferences {
  showDeveloperTabs: boolean;
  [key: string]: boolean;
}

interface Editor {
  // Editor interface for preferences
}

class PreferencesUI {
  private editor: Editor;
  private modalElement: HTMLElement | null = null;
  private isOpen: boolean = false;
  private preferences: Preferences;

  constructor(editor: Editor) {
    this.editor = editor;

    // Load preferences from localStorage
    this.preferences = this.loadPreferences();
  }

  /**
   * Load preferences from localStorage
   */
  private loadPreferences(): Preferences {
    const stored = localStorage.getItem('musicEditorPreferences');
    const defaults: Preferences = { showDeveloperTabs: true };
    if (stored) {
      const parsed = JSON.parse(stored);
      // Only keep showDeveloperTabs, ignore legacy preferences
      return { showDeveloperTabs: parsed.showDeveloperTabs ?? defaults.showDeveloperTabs };
    }
    return defaults;
  }

  /**
   * Save preferences to localStorage
   */
  private savePreferences(): void {
    localStorage.setItem('musicEditorPreferences', JSON.stringify(this.preferences));
  }

  /**
   * Open the preferences dialog
   */
  open(): void {
    if (this.isOpen) return;

    this.createModalElement();
    if (this.modalElement) {
      document.body.appendChild(this.modalElement);
    }
    this.isOpen = true;

    // Focus on first input for accessibility
    const firstInput = this.modalElement?.querySelector('input, select') as HTMLElement | null;
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 0);
    }
  }

  /**
   * Close the preferences dialog
   */
  close(): void {
    if (this.modalElement && this.modalElement.parentNode) {
      this.modalElement.parentNode.removeChild(this.modalElement);
    }
    this.isOpen = false;
  }

  /**
   * Create the modal DOM structure
   */
  private createModalElement(): void {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Escape key handler
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    const content = document.createElement('div');
    content.className = 'bg-gray-100 rounded shadow-xl w-auto mx-4 flex flex-col max-w-md';

    // Header
    const header = document.createElement('div');
    header.className = 'bg-gray-200 border-b border-gray-300 px-3 py-2';

    const title = document.createElement('h2');
    title.className = 'text-sm font-semibold text-gray-900';
    title.textContent = 'Preferences';

    header.appendChild(title);

    // Body with preferences form
    const body = document.createElement('div');
    body.className = 'px-4 py-3 flex-1 space-y-4';

    // Show Developer Tabs preference
    const devTabsGroup = this.createCheckboxGroup(
      'showDeveloperTabs',
      'Show Developer Tabs',
      'Display developer tabs: MusicXML, Display List, Persistent Model, IR, and HTML',
      this.preferences.showDeveloperTabs
    );
    body.appendChild(devTabsGroup);

    // Footer with buttons
    const footer = document.createElement('div');
    footer.className = 'bg-gray-100 border-t border-gray-300 px-3 py-2 flex justify-end gap-2';

    const resetBtn = document.createElement('button');
    resetBtn.className =
      'px-3 py-1 text-xs font-medium text-gray-900 bg-gray-200 border border-gray-300 rounded hover:bg-gray-300 active:bg-gray-400 transition-colors duration-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer';
    resetBtn.textContent = 'Reset to Defaults';
    resetBtn.addEventListener('click', () => this.resetToDefaults());

    const saveBtn = document.createElement('button');
    saveBtn.className =
      'px-3 py-1 text-xs font-medium text-white bg-blue-500 border border-blue-600 rounded hover:bg-blue-600 active:bg-blue-700 transition-colors duration-100 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => this.handleSave());

    const closeBtn = document.createElement('button');
    closeBtn.className =
      'px-3 py-1 text-xs font-medium text-gray-900 bg-gray-200 border border-gray-300 rounded hover:bg-gray-300 active:bg-gray-400 transition-colors duration-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer';
    closeBtn.textContent = 'Cancel';
    closeBtn.addEventListener('click', () => this.close());

    footer.appendChild(resetBtn);
    footer.appendChild(saveBtn);
    footer.appendChild(closeBtn);

    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);

    modal.appendChild(content);
    this.modalElement = modal;
  }

  /**
   * Create a checkbox preference group
   */
  private createCheckboxGroup(id: string, label: string, description: string, checked: boolean): HTMLElement {
    const group = document.createElement('div');
    group.className = 'flex flex-col gap-1';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'flex items-center gap-2';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = checked;
    checkbox.className =
      'w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500 cursor-pointer';
    checkbox.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.preferences[id] = target.checked;
    });

    const labelText = document.createElement('label');
    labelText.htmlFor = id;
    labelText.className = 'text-sm font-medium text-gray-900 cursor-pointer';
    labelText.textContent = label;

    labelDiv.appendChild(checkbox);
    labelDiv.appendChild(labelText);

    const descText = document.createElement('div');
    descText.className = 'text-xs text-gray-600 ml-6';
    descText.textContent = description;

    group.appendChild(labelDiv);
    group.appendChild(descText);

    return group;
  }

  /**
   * Reset preferences to defaults
   */
  private resetToDefaults(): void {
    this.preferences = { showDeveloperTabs: true };

    // Update form
    const form = this.modalElement?.querySelector('form') || this.modalElement;
    const showDevTabs = form?.querySelector('#showDeveloperTabs') as HTMLInputElement | null;
    if (showDevTabs) showDevTabs.checked = true;

    this.showNotification('Preferences reset to defaults', 'info');
  }

  /**
   * Handle save button click
   */
  private handleSave(): void {
    this.savePreferences();
    this.applyPreferences();
    this.showNotification('Preferences saved successfully', 'success');
    this.close();
  }

  /**
   * Apply preferences to the application
   */
  applyPreferences(): void {
    // Hide/show developer source tabs
    // NOTE: tab-lilypond-src and tab-lilypond-png are user-facing and remain visible
    const developerTabIds = [
      'tab-musicxml',      // Developer-only: internal XML format
      'tab-displaylist',   // Developer-only: WASM render commands
      'tab-persistent',    // Developer-only: internal document model
      'tab-ir',            // Developer-only: IR structures
      'tab-html'           // Developer-only: DOM debugging
    ];

    developerTabIds.forEach(tabId => {
      const tab = document.getElementById(tabId);
      if (tab) {
        tab.style.display = this.preferences.showDeveloperTabs ? '' : 'none';
      }
    });

    // Notify editor of changes (if needed)
    if (this.editor) {
      // Dispatch custom event for other components to listen to
      const event = new CustomEvent('preferencesChanged', {
        detail: this.preferences,
      });
      document.dispatchEvent(event);
    }
  }

  /**
   * Get a specific preference value
   */
  get(key: string): boolean {
    return this.preferences[key];
  }

  /**
   * Show a notification message
   */
  private showNotification(message: string, type: string = 'info'): void {
    // For now, just log to console
    logger.info(LOG_CATEGORIES.UI, `[${type.toUpperCase()}] ${message}`);

    // Optional: display a toast notification
    // This could be enhanced with a toast component later
  }

  /**
   * Initialize preferences (apply saved preferences on app startup)
   */
  initialize(): void {
    this.applyPreferences();
  }
}

/**
 * Export PreferencesUI as the default export
 */
export default PreferencesUI;
