/**
 * Context Menu Manager
 * Handles right-click context menus for gutter interactions
 * Based on proto2.html design
 */

export class ContextMenuManager {
  constructor() {
    this.menu = null;
    this.targetElement = null;
    this.onSelectCallback = null;

    // Bind event handlers
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleDocumentContextMenu = this.handleDocumentContextMenu.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleMenuClick = this.handleMenuClick.bind(this);
  }

  /**
   * Initialize the context menu system
   * @param {string} menuId - ID of the context menu element
   */
  initialize(menuId) {
    this.menu = document.getElementById(menuId);
    if (!this.menu) {
      console.error(`Context menu element #${menuId} not found`);
      return;
    }

    // Attach event listeners
    this.menu.addEventListener('click', this.handleMenuClick);
    document.addEventListener('click', this.handleDocumentClick, true); // Use capture phase
    document.addEventListener('contextmenu', this.handleDocumentContextMenu);
    window.addEventListener('scroll', this.handleScroll);
  }

  /**
   * Show context menu at specific position
   * @param {number} x - Page X coordinate
   * @param {number} y - Page Y coordinate
   * @param {string} currentValue - Currently selected value
   * @param {HTMLElement} target - Target element that was right-clicked
   * @param {Function} onSelect - Callback when item is selected
   * @param {Object} options - Optional configuration
   * @param {Object} options.disabledItems - Map of item choice to disabled message
   */
  show(x, y, currentValue, target, onSelect, options = {}) {
    if (!this.menu) return;

    this.targetElement = target;
    this.onSelectCallback = onSelect;

    // Position menu
    this.menu.style.left = `${x}px`;
    this.menu.style.top = `${y}px`;
    this.menu.style.display = 'block';

    // Update radio button states
    this.updateRadioStates(currentValue);

    // Update disabled states
    this.updateDisabledStates(options.disabledItems || {});

    // Prevent menu from going off-screen
    this.adjustPosition();
  }

  /**
   * Hide the context menu
   */
  hide() {
    if (!this.menu) return;

    this.menu.style.display = 'none';
    this.targetElement = null;
    this.onSelectCallback = null;
  }

  /**
   * Hide the context menu if it's currently visible
   */
  hideIfVisible() {
    if (this.menu && this.menu.style.display !== 'none') {
      this.hide();
    }
  }

  /**
   * Update radio button visual states
   * @param {string} selectedValue - Value to mark as checked
   */
  updateRadioStates(selectedValue) {
    const radios = this.menu.querySelectorAll('.context-menu-radio');
    radios.forEach(radio => {
      radio.classList.remove('checked');
    });

    const selectedRadio = this.menu.querySelector(`[data-radio="${selectedValue}"]`);
    if (selectedRadio) {
      selectedRadio.classList.add('checked');
    }
  }

  /**
   * Update disabled states for menu items
   * @param {Object} disabledItems - Map of item choice to disabled message
   */
  updateDisabledStates(disabledItems) {
    const items = this.menu.querySelectorAll('.context-menu-item');
    items.forEach(item => {
      const choice = item.dataset.choice;
      if (disabledItems[choice]) {
        item.classList.add('disabled');
        item.title = disabledItems[choice];
      } else {
        item.classList.remove('disabled');
        item.title = '';
      }
    });
  }

  /**
   * Adjust menu position to prevent going off-screen
   */
  adjustPosition() {
    const rect = this.menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = parseFloat(this.menu.style.left);
    let top = parseFloat(this.menu.style.top);

    // Adjust if going off right edge
    if (rect.right > viewportWidth) {
      left = viewportWidth - rect.width - 10;
    }

    // Adjust if going off bottom edge
    if (rect.bottom > viewportHeight) {
      top = viewportHeight - rect.height - 10;
    }

    // Ensure not going off left/top edges
    left = Math.max(10, left);
    top = Math.max(10, top);

    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
  }

  /**
   * Handle menu item click
   * @param {Event} e - Click event
   */
  handleMenuClick(e) {
    const item = e.target.closest('.context-menu-item');
    if (!item || !this.targetElement || !this.onSelectCallback) return;

    // Ignore clicks on disabled items
    if (item.classList.contains('disabled')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation(); // Prevent click from propagating to document handler

    const choice = item.dataset.choice;
    if (!choice) return;

    // Update radio button visual state immediately (user feedback)
    this.updateRadioStates(choice);

    // Wait a bit so user can see the selection feedback, then call callback and hide
    setTimeout(() => {
      // Call the callback with the selected choice
      this.onSelectCallback(choice, this.targetElement);

      // Hide menu after callback completes
      this.hide();
    }, 150); // 150ms delay for visual feedback
  }

  /**
   * Handle clicks outside the menu (left-click only)
   * @param {Event} e - Click event
   */
  handleDocumentClick(e) {
    // Only respond to left-clicks (button 0)
    // This prevents the right-click that opens the menu from also closing it
    if (e.button !== 0 && e.button !== undefined) {
      return;
    }

    // Only hide if menu is visible
    if (!this.menu || this.menu.style.display === 'none') {
      return;
    }

    // If click is outside the menu, hide it
    if (!this.menu.contains(e.target)) {
      this.hide();
    }
  }

  /**
   * Handle contextmenu events globally to hide menu on right-click elsewhere
   * @param {Event} e - Contextmenu event
   */
  handleDocumentContextMenu(e) {
    // If menu is visible and right-click is outside menu, hide it
    if (this.menu && this.menu.style.display !== 'none') {
      if (!this.menu.contains(e.target)) {
        this.hide();
      }
    }
  }

  /**
   * Handle scroll events (hide menu)
   */
  handleScroll() {
    this.hide();
  }

  /**
   * Clean up event listeners
   */
  destroy() {
    if (this.menu) {
      this.menu.removeEventListener('click', this.handleMenuClick);
    }
    document.removeEventListener('click', this.handleDocumentClick, true); // Match capture: true
    document.removeEventListener('contextmenu', this.handleDocumentContextMenu);
    window.removeEventListener('scroll', this.handleScroll);
  }
}
