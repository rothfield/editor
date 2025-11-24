/**
 * Constraints Dialog - Scale/Mode/Maqam/Raga Selection Interface
 * Provides a tabbed, searchable UI for selecting scale constraints
 */

import logger, { LOG_CATEGORIES } from './logger.js';

export class ConstraintsDialog {
  constructor(editor) {
    this.editor = editor;
    this.modal = document.getElementById('constraints-modal');
    this.closeBtn = document.getElementById('constraints-close');
    this.closeBtnFooter = document.getElementById('constraints-close-footer');
    this.overlay = this.modal.querySelector('.constraints-overlay');
    this.displayElement = document.getElementById('constraints-display');
    this.clearBtn = document.getElementById('constraints-clear');
    this.customBtn = document.getElementById('constraints-custom');
    this.searchInput = document.getElementById('constraints-search');
    this.emptyState = document.getElementById('constraints-empty');

    // Tab elements
    this.tabs = this.modal.querySelectorAll('.constraints-tab');
    this.tabPanels = this.modal.querySelectorAll('.constraints-tab-panel');

    // Grid containers for each tab
    this.grids = {
      western: document.getElementById('constraints-grid-western'),
      raga: document.getElementById('constraints-grid-raga'),
      maqam: document.getElementById('constraints-grid-maqam'),
      all: document.getElementById('constraints-grid-all')
    };

    this.constraints = [];
    this.selectedConstraintId = null;
    this.currentTab = 'western';
    this.searchQuery = '';
    this.selectedPitchSystem = 'Number'; // Default to Number system

    // Get pitch system selector
    this.pitchSystemSelect = document.getElementById('constraints-pitch-system-select');

    this.bindEvents();
  }

  bindEvents() {
    // Close button (header X)
    this.closeBtn.addEventListener('click', () => this.close());

    // Close button (footer)
    if (this.closeBtnFooter) {
      this.closeBtnFooter.addEventListener('click', () => this.close());
    }

    // Overlay click to close
    this.overlay.addEventListener('click', () => this.close());

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });

    // Tab switching
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Search input
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderCurrentTab();
    });

    // Clear constraint button
    this.clearBtn.addEventListener('click', () => this.clearConstraint());

    // Custom constraint button (placeholder for now)
    this.customBtn.addEventListener('click', () => {
      alert('Custom constraint creation coming soon!');
      // TODO: Implement custom constraint form
    });

    // Pitch system selector
    if (this.pitchSystemSelect) {
      this.pitchSystemSelect.addEventListener('change', (e) => {
        this.selectedPitchSystem = e.target.value;
        this.renderCurrentTab(); // Re-render to show notes in new pitch system
      });
    }
  }

  /**
   * Switch to a different tab
   */
  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab active state
    this.tabs.forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Update panel active state
    this.tabPanels.forEach(panel => {
      if (panel.dataset.panel === tabName) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Render the current tab
    this.renderCurrentTab();
  }

  /**
   * Load constraints from WASM and populate the UI
   */
  async loadConstraints() {
    try {
      // Get constraints from WASM
      const wasmModule = this.editor.wasmModule;
      if (!wasmModule || typeof wasmModule.getPredefinedConstraints !== 'function') {
        logger.error(LOG_CATEGORIES.WASM, 'WASM module not ready or getPredefinedConstraints not available');
        return;
      }

      this.constraints = wasmModule.getPredefinedConstraints();
      this.renderAllTabs();
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error loading constraints', { error });
  }

  /**
   * Render all tabs (called on initial load)
   */
  renderAllTabs() {
    this.renderTab('western');
    this.renderTab('raga');
    this.renderTab('maqam');
    this.renderTab('all');
  }

  /**
   * Render the current active tab
   */
  renderCurrentTab() {
    this.renderTab(this.currentTab);
  }

  /**
   * Render a specific tab with optional search filtering
   */
  renderTab(tabName) {
    const grid = this.grids[tabName];
    if (!grid) return;

    // Filter constraints by tab and search query
    let filtered = this.filterConstraintsByTab(tabName);

    // Apply search filter
    if (this.searchQuery) {
      filtered = filtered.filter(c => {
        const name = c.name.toLowerCase();
        const desc = (c.description || '').toLowerCase();
        return name.includes(this.searchQuery) || desc.includes(this.searchQuery);
      });
    }

    // Show/hide empty state
    if (filtered.length === 0) {
      grid.innerHTML = '';
      if (tabName === this.currentTab) {
        this.emptyState.classList.remove('hidden');
      }
      return;
    } else {
      this.emptyState.classList.add('hidden');
    }

    // Render cards
    grid.innerHTML = filtered.map(constraint => this.renderCard(constraint)).join('');

    // Attach click handlers
    grid.querySelectorAll('.constraints-card').forEach(card => {
      card.addEventListener('click', () => {
        const constraintId = card.dataset.constraintId;
        this.selectConstraint(constraintId);
      });
    });
  }

  /**
   * Filter constraints by tab category
   */
  filterConstraintsByTab(tabName) {
    if (tabName === 'all') {
      return this.constraints;
    }

    const categoryMap = {
      western: 'WesternMode',
      raga: 'Raga',
      maqam: 'Maqam'
    };

    const category = categoryMap[tabName];
    return this.constraints.filter(c => c.category === category);
  }

  /**
   * Get the notes for a constraint in the selected pitch system
   * @param {string} constraintId - The constraint ID
   * @returns {Array<string>} - Array of note names
   */
  getConstraintNotesForDisplay(constraintId) {
    try {
      const wasmModule = this.editor.wasmModule;
      if (!wasmModule || typeof wasmModule.getConstraintNotes !== 'function') {
        logger.warn(LOG_CATEGORIES.WASM, 'getConstraintNotes not available');
        return [];
      }

      const notes = wasmModule.getConstraintNotes(constraintId, this.selectedPitchSystem);
      return notes || [];
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error getting constraint notes', { error });
  }

  /**
   * Render a single constraint card
   */
  renderCard(constraint) {
    const selected = this.selectedConstraintId === constraint.id ? 'selected' : '';
    const description = constraint.description || '';
    const badges = this.getConstraintBadges(constraint);

    // Get notes for this constraint in the selected pitch system
    const notes = this.getConstraintNotesForDisplay(constraint.id);
    const notesHtml = notes.length > 0
      ? `<div class="constraints-card-notes">${notes.join(' ')}</div>`
      : '';

    return `
      <div class="constraints-card ${selected}" data-constraint-id="${constraint.id}">
        <div class="constraints-card-header">
          <div class="constraints-card-name">${constraint.name}</div>
          <div class="constraints-card-check"></div>
        </div>
        ${badges.length > 0 ? `
          <div class="constraints-card-badges">
            ${badges.map(badge => `<span class="constraints-card-badge badge-${badge.type}">${badge.label}</span>`).join('')}
          </div>
        ` : ''}
        ${notesHtml}
        ${description ? `<div class="constraints-card-description">${description}</div>` : ''}
      </div>
    `;
  }

  /**
   * Detect special features of a constraint and return badge data
   *
   * Note: Rust DegreeConstraint serializes as:
   * - "Omit" (string)
   * - "Any" (string)
   * - {"Only": ["Natural", "Flat", ...]} (object)
   */
  getConstraintBadges(constraint) {
    const badges = [];

    // Count non-omitted degrees
    const activeDegrees = constraint.degrees.filter(d => d !== 'Omit').length;

    // Pentatonic (5 notes)
    if (activeDegrees === 5) {
      badges.push({ type: 'pentatonic', label: '5-note' });
    }

    // Hexatonic (6 notes)
    if (activeDegrees === 6) {
      badges.push({ type: 'hexatonic', label: '6-note' });
    }

    // Quarter-tone (check for HalfFlat in degrees)
    const hasQuarterTone = constraint.degrees.some(degree => {
      // Check if degree is an object with "Only" property
      if (typeof degree === 'object' && degree !== null && 'Only' in degree) {
        const accidentals = degree.Only;
        // Check if HalfFlat is in the array
        return Array.isArray(accidentals) && accidentals.includes('HalfFlat');
      }
      return false;
    });

    if (hasQuarterTone) {
      badges.push({ type: 'quarter-tone', label: 'Quarter-Tone' });
    }

    // Variable (multiple accidentals per degree)
    const hasVariable = constraint.degrees.some(degree => {
      // Check if degree has multiple allowed accidentals
      if (typeof degree === 'object' && degree !== null && 'Only' in degree) {
        const accidentals = degree.Only;
        return Array.isArray(accidentals) && accidentals.length > 1;
      }
      return false;
    });

    if (hasVariable) {
      badges.push({ type: 'variable', label: 'Variable' });
    }

    return badges;
  }

  /**
   * Open the constraints dialog
   */
  async open() {
    // Load constraints if not already loaded
    if (this.constraints.length === 0) {
      await this.loadConstraints();
    }

    // Get current active constraint from WASM
    try {
      const wasmModule = this.editor.wasmModule;
      if (wasmModule && typeof wasmModule.getActiveConstraint === 'function') {
        const activeConstraintId = wasmModule.getActiveConstraint();
        this.selectedConstraintId = activeConstraintId || null;
      }
          } catch (error) {
            logger.error(LOG_CATEGORIES.WASM, 'Error getting active constraint', { error });    // Reset search
    this.searchQuery = '';
    this.searchInput.value = '';

    // Render all tabs with current selection
    this.renderAllTabs();
    this.updateDisplay();

    // Show modal
    this.modal.classList.remove('hidden');

    // Focus search box
    setTimeout(() => this.searchInput.focus(), 100);
  }

  /**
   * Close the dialog
   */
  close() {
    this.modal.classList.add('hidden');

    // Restore focus to editor
    if (this.editor && this.editor.element) {
      this.editor.element.focus({ preventScroll: true });
    }
  }

  /**
   * Select a constraint
   */
  async selectConstraint(constraintId) {
    try {
      const wasmModule = this.editor.wasmModule;
      if (!wasmModule || typeof wasmModule.setActiveConstraint !== 'function') {
        logger.error(LOG_CATEGORIES.WASM, 'WASM module not ready');
        return;
      }

      // Set constraint in WASM
      // Note: setActiveConstraint is in documentMutatingFunctions, so WASMBridge
      // automatically triggers renderAndUpdate() and updateDocumentDisplay()
      // which includes updateModeToggleDisplay()
      wasmModule.setActiveConstraint(constraintId);

      // Update dialog UI
      this.selectedConstraintId = constraintId;
      this.renderAllTabs();
      this.updateDisplay();

      logger.info(LOG_CATEGORIES.UI, `Active constraint set to: ${constraintId}`);
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error setting constraint', { error });
    }
  }

  /**
   * Clear the active constraint
   */
  async clearConstraint() {
    try {
      const wasmModule = this.editor.wasmModule;
      if (!wasmModule || typeof wasmModule.setActiveConstraint !== 'function') {
        logger.error(LOG_CATEGORIES.WASM, 'WASM module not ready');
        return;
      }

      // Clear constraint in WASM (null clears it)
      // Note: setActiveConstraint is in documentMutatingFunctions, so WASMBridge
      // automatically triggers renderAndUpdate() and updateDocumentDisplay()
      // which includes updateModeToggleDisplay()
      wasmModule.setActiveConstraint(null);

      // Update dialog UI
      this.selectedConstraintId = null;
      this.renderAllTabs();
      this.updateDisplay();

      logger.info(LOG_CATEGORIES.UI, 'Constraint cleared');
    } catch (error) {
      logger.error(LOG_CATEGORIES.WASM, 'Error clearing constraint', { error });
    }
  }

  /**
   * Update the display of the currently selected constraint
   */
  updateDisplay() {
    if (!this.selectedConstraintId) {
      this.displayElement.textContent = 'None';
      return;
    }

    // Find the constraint by ID
    const constraint = this.constraints.find(c => c.id === this.selectedConstraintId);
    if (constraint) {
      this.displayElement.textContent = constraint.name;
    } else {
      this.displayElement.textContent = 'Unknown';
    }
  }
}
