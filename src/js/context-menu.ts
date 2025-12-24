/**
 * Context Menu Manager
 * Handles right-click context menus for gutter interactions
 * Based on proto2.html design
 */

interface DisabledItems {
  [choice: string]: string;
}

interface ShowOptions {
  disabledItems?: DisabledItems;
}

type OnSelectCallback = (choice: string, target: HTMLElement) => void;

export class ContextMenuManager {
  private menu: HTMLElement | null = null;
  private targetElement: HTMLElement | null = null;
  private onSelectCallback: OnSelectCallback | null = null;
  private justOpened: boolean = false;

  constructor() {
    // Bind event handlers
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleDocumentContextMenu = this.handleDocumentContextMenu.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleMenuClick = this.handleMenuClick.bind(this);
  }

  /**
   * Initialize the context menu system
   */
  initialize(menuId: string): void {
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
   */
  show(
    x: number,
    y: number,
    currentValue: string,
    target: HTMLElement,
    onSelect: OnSelectCallback,
    options: ShowOptions = {}
  ): void {
    if (!this.menu) return;

    this.targetElement = target;
    this.onSelectCallback = onSelect;

    // Set flag to prevent immediate close from document contextmenu handler
    this.justOpened = true;
    setTimeout(() => {
      this.justOpened = false;
    }, 100); // Small delay to let the opening event complete

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
  hide(): void {
    if (!this.menu) return;

    this.menu.style.display = 'none';
    this.targetElement = null;
    this.onSelectCallback = null;
  }

  /**
   * Hide the context menu if it's currently visible
   */
  hideIfVisible(): void {
    if (this.menu && this.menu.style.display !== 'none') {
      this.hide();
    }
  }

  /**
   * Update radio button visual states
   */
  updateRadioStates(selectedValue: string): void {
    if (!this.menu) return;

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
   */
  updateDisabledStates(disabledItems: DisabledItems): void {
    if (!this.menu) return;

    const items = this.menu.querySelectorAll<HTMLElement>('.context-menu-item');
    items.forEach(item => {
      const choice = item.dataset.choice;
      if (choice && disabledItems[choice]) {
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
  adjustPosition(): void {
    if (!this.menu) return;

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
   */
  handleMenuClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>('.context-menu-item');
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
    const callback = this.onSelectCallback;
    const targetEl = this.targetElement;
    setTimeout(() => {
      // Call the callback with the selected choice
      callback(choice, targetEl);

      // Hide menu after callback completes
      this.hide();
    }, 150); // 150ms delay for visual feedback
  }

  /**
   * Handle clicks outside the menu (left-click only)
   */
  handleDocumentClick(e: MouseEvent): void {
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
    const target = e.target as Node;
    if (!this.menu.contains(target)) {
      this.hide();
    }
  }

  /**
   * Handle contextmenu events globally to hide menu on right-click elsewhere
   */
  handleDocumentContextMenu(e: MouseEvent): void {
    // Don't close if menu was just opened (prevents race condition)
    if (this.justOpened) {
      return;
    }

    // If menu is visible and right-click is outside menu, hide it
    if (this.menu && this.menu.style.display !== 'none') {
      const target = e.target as Node;
      if (!this.menu.contains(target)) {
        this.hide();
      }
    }
  }

  /**
   * Handle scroll events (hide menu)
   */
  handleScroll(): void {
    this.hide();
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    if (this.menu) {
      this.menu.removeEventListener('click', this.handleMenuClick);
    }
    document.removeEventListener('click', this.handleDocumentClick, true); // Match capture: true
    document.removeEventListener('contextmenu', this.handleDocumentContextMenu);
    window.removeEventListener('scroll', this.handleScroll);
  }
}
