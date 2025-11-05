/**
 * Preferences UI Component
 *
 * Provides a preferences dialog for managing application settings:
 * - Show developer tabs (inspector panel visibility)
 * - Default notation system
 * - Show debug info (display debug information in editor)
 *
 * Uses UnoCSS for styling and localStorage for persistence
 */

class PreferencesUI {
  constructor(editor) {
    this.editor = editor;
    this.modalElement = null;
    this.isOpen = false;

    // Load preferences from localStorage
    this.preferences = this.loadPreferences();
  }

  /**
   * Load preferences from localStorage
   * @private
   */
  loadPreferences() {
    const stored = localStorage.getItem('musicEditorPreferences');
    return stored
      ? JSON.parse(stored)
      : {
          showDeveloperTabs: true,
          defaultNotationSystem: 'western', // or 'number', 'sargam', 'bhatkhande', 'tabla'
          showDebugInfo: false,
        };
  }

  /**
   * Save preferences to localStorage
   * @private
   */
  savePreferences() {
    localStorage.setItem('musicEditorPreferences', JSON.stringify(this.preferences));
  }

  /**
   * Open the preferences dialog
   */
  open() {
    if (this.isOpen) return;

    this.createModalElement();
    document.body.appendChild(this.modalElement);
    this.isOpen = true;

    // Focus on first input for accessibility
    const firstInput = this.modalElement.querySelector('input, select');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 0);
    }
  }

  /**
   * Close the preferences dialog
   */
  close() {
    if (this.modalElement && this.modalElement.parentNode) {
      this.modalElement.parentNode.removeChild(this.modalElement);
    }
    this.isOpen = false;
  }

  /**
   * Create the modal DOM structure
   * @private
   */
  createModalElement() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.close();
    });

    // Escape key handler
    const handleEscape = (e) => {
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

    // Default Notation System preference
    const notationGroup = this.createSelectGroup(
      'defaultNotationSystem',
      'Default Notation System',
      'Choose the default pitch notation system for new documents',
      this.preferences.defaultNotationSystem
    );
    body.appendChild(notationGroup);

    // Show Debug Info preference
    const debugGroup = this.createCheckboxGroup(
      'showDebugInfo',
      'Show Debug Info',
      'Display debug information and metrics in the editor',
      this.preferences.showDebugInfo
    );
    body.appendChild(debugGroup);

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
   * @private
   */
  createCheckboxGroup(id, label, description, checked) {
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
      this.preferences[id] = e.target.checked;
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
   * Create a select/dropdown preference group
   * @private
   */
  createSelectGroup(id, label, description, selectedValue) {
    const group = document.createElement('div');
    group.className = 'flex flex-col gap-1';

    const labelText = document.createElement('label');
    labelText.htmlFor = id;
    labelText.className = 'text-sm font-medium text-gray-900';
    labelText.textContent = label;

    const select = document.createElement('select');
    select.id = id;
    select.className =
      'px-2 py-1 text-sm border border-gray-300 rounded bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer';

    const options = [
      { value: 'western', label: 'Western (C, D, E, ...)' },
      { value: 'number', label: 'Number (1, 2, 3, ...)' },
      { value: 'sargam', label: 'Sargam (Sa, Re, Ga, ...)' },
      { value: 'bhatkhande', label: 'Bhatkhande (S, R, G, ...)' },
      { value: 'tabla', label: 'Tabla (Ta, Ka, Jha, ...)' },
    ];

    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.selected = opt.value === selectedValue;
      select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
      this.preferences[id] = e.target.value;
    });

    const descText = document.createElement('div');
    descText.className = 'text-xs text-gray-600';
    descText.textContent = description;

    group.appendChild(labelText);
    group.appendChild(select);
    group.appendChild(descText);

    return group;
  }

  /**
   * Reset preferences to defaults
   * @private
   */
  resetToDefaults() {
    this.preferences = {
      showDeveloperTabs: true,
      defaultNotationSystem: 'western',
      showDebugInfo: false,
    };

    // Update form
    const form = this.modalElement.querySelector('form') || this.modalElement;
    const showDevTabs = form.querySelector('#showDeveloperTabs');
    if (showDevTabs) showDevTabs.checked = true;

    const notationSystem = form.querySelector('#defaultNotationSystem');
    if (notationSystem) notationSystem.value = 'western';

    const showDebug = form.querySelector('#showDebugInfo');
    if (showDebug) showDebug.checked = false;

    this.showNotification('Preferences reset to defaults', 'info');
  }

  /**
   * Handle save button click
   * @private
   */
  handleSave() {
    this.savePreferences();
    this.applyPreferences();
    this.showNotification('Preferences saved successfully', 'success');
    this.close();
  }

  /**
   * Apply preferences to the application
   */
  applyPreferences() {
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

    // Show/hide debug info
    if (this.preferences.showDebugInfo) {
      document.documentElement.setAttribute('data-debug-info', 'true');
    } else {
      document.documentElement.removeAttribute('data-debug-info');
    }

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
  get(key) {
    return this.preferences[key];
  }

  /**
   * Show a notification message
   * @private
   */
  showNotification(message, type = 'info') {
    // For now, just log to console
    console.log(`[${type.toUpperCase()}] ${message}`);

    // Optional: display a toast notification
    // This could be enhanced with a toast component later
  }

  /**
   * Initialize preferences (apply saved preferences on app startup)
   */
  initialize() {
    this.applyPreferences();
  }
}

/**
 * Export PreferencesUI as the default export
 */
export default PreferencesUI;
