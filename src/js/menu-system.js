/**
 * Menu System
 *
 * Handles menu creation, display, and interaction for the Music Notation Editor.
 */

import { FOCUS_RETURN_TIMEOUT_MS } from './constants.js';

/**
 * Menu system manager
 */
class MenuSystem {
  constructor(editor) {
    this.editor = editor;
    this.activeMenu = null;
    this.menuElements = new Map();

    // Bind methods
    this.handleMenuToggle = this.handleMenuToggle.bind(this);
    this.handleMenuItemClick = this.handleMenuItemClick.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleKeyboard = this.handleKeyboard.bind(this);
  }

  /**
   * Initialize menu system
   */
  initialize() {
    this.setupFileMenu();
    this.setupEditMenu();
    this.setupLineMenu();
    this.setupEventListeners();
  }

  /**
   * Setup File menu
   */
  setupFileMenu() {
    const items = [
      { id: 'menu-new', label: 'New', action: 'new-document' },
      { id: 'menu-open', label: 'Open...', action: 'open-document' },
      { id: 'menu-save', label: 'Save', action: 'save-document' },
      { separator: true },
      { id: 'menu-export-musicxml', label: 'Export MusicXML...', action: 'export-musicxml' },
      { id: 'menu-export-lilypond', label: 'Export LilyPond...', action: 'export-lilypond' },
      { separator: true },
      { id: 'menu-set-title', label: 'Set Title...', action: 'set-title' },
      { id: 'menu-set-tonic', label: 'Set Tonic...', action: 'set-tonic' },
      { id: 'menu-set-pitch-system', label: 'Set Pitch System...', action: 'set-pitch-system' },
      { id: 'menu-set-key-signature', label: 'Set Key Signature...', action: 'set-key-signature' }
    ];

    this.createMenu('file', items);
  }

  /**
   * Setup Edit menu
   */
  setupEditMenu() {
    const items = [
      { id: 'menu-apply-slur', label: 'Apply Slur (Alt+S)', action: 'apply-slur' },
      { separator: true },
      { id: 'menu-octave-upper', label: 'Upper Octave (Alt+U)', action: 'octave-upper' },
      { id: 'menu-octave-middle', label: 'Middle Octave (Alt+M)', action: 'octave-middle' },
      { id: 'menu-octave-lower', label: 'Lower Octave (Alt+L)', action: 'octave-lower' }
    ];

    this.createMenu('edit', items);
  }

  /**
   * Setup Line menu
   */
  setupLineMenu() {
    const items = [
      { id: 'menu-set-label', label: 'Set Label...', action: 'set-label' },
      { id: 'menu-set-line-tonic', label: 'Set Tonic...', action: 'set-line-tonic' },
      { id: 'menu-set-line-pitch-system', label: 'Set Pitch System...', action: 'set-line-pitch-system' },
      { id: 'menu-set-lyrics', label: 'Set Lyrics...', action: 'set-lyrics' },
      { id: 'menu-set-tala', label: 'Set Tala...', action: 'set-tala' },
      { id: 'menu-set-line-key-signature', label: 'Set Key Signature...', action: 'set-line-key-signature' }
    ];

    this.createMenu('line', items);
  }

  /**
   * Create menu from items definition
   *
   * @param {string} name - Menu name
   * @param {Array} items - Menu items
   */
  createMenu(name, items) {
    const menuElement = document.getElementById(`${name}-menu`);
    if (!menuElement) {
      console.warn(`Menu element not found: ${name}-menu`);
      return;
    }

    menuElement.innerHTML = '';

    items.forEach(item => {
      if (item.separator) {
        const separator = document.createElement('div');
        separator.className = 'menu-separator';
        menuElement.appendChild(separator);
      } else {
        const menuItem = document.createElement('div');
        menuItem.id = item.id;
        menuItem.className = 'menu-item';
        menuItem.dataset.action = item.action;
        menuItem.textContent = item.label;
        menuItem.addEventListener('click', this.handleMenuItemClick);
        menuElement.appendChild(menuItem);
      }
    });

    this.menuElements.set(name, menuElement);
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Menu button listeners
    ['file', 'edit', 'line'].forEach(menuName => {
      const button = document.getElementById(`${menuName}-menu-button`);
      if (button) {
        button.addEventListener('click', (e) => this.handleMenuToggle(menuName, e));
      }
    });

    // Outside click
    document.addEventListener('click', this.handleOutsideClick);

    // Keyboard navigation
    document.addEventListener('keydown', this.handleKeyboard);
  }

  /**
   * Handle menu toggle
   *
   * @param {string} menuName - Menu to toggle
   * @param {Event} event - Click event
   */
  handleMenuToggle(menuName, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const menu = this.menuElements.get(menuName);
    const button = document.getElementById(`${menuName}-menu-button`);

    if (!menu || !button) return;

    // Close other menus
    if (this.activeMenu && this.activeMenu !== menuName) {
      this.closeAllMenus();
    }

    // Toggle current menu
    const isHidden = menu.classList.contains('hidden');

    if (isHidden) {
      menu.classList.remove('hidden');
      button.classList.add('bg-ui-active');
      this.activeMenu = menuName;
    } else {
      menu.classList.add('hidden');
      button.classList.remove('bg-ui-active');
      this.activeMenu = null;
    }
  }

  /**
   * Handle menu item click
   *
   * @param {Event} event - Click event
   */
  handleMenuItemClick(event) {
    const menuItem = event.target.closest('.menu-item');
    if (!menuItem) return;

    const action = menuItem.dataset.action;
    if (!action) return;

    event.preventDefault();
    event.stopPropagation();

    // Execute action
    this.executeAction(action);

    // Close menu
    this.closeAllMenus();

    // Return focus to editor
    this.returnFocusToEditor();
  }

  /**
   * Execute menu action
   *
   * @param {string} action - Action to execute
   */
  executeAction(action) {
    // Delegate to editor's UI component
    if (this.editor && this.editor.ui && this.editor.ui.executeMenuAction) {
      this.editor.ui.executeMenuAction(action);
    } else {
      console.warn(`Cannot execute action: ${action}`);
    }
  }

  /**
   * Handle outside clicks
   *
   * @param {Event} event - Click event
   */
  handleOutsideClick(event) {
    const isMenuButton = event.target.closest('[id$="-menu-button"]');
    const isMenuDropdown = event.target.closest('[id$="-menu"]');

    if (!isMenuButton && !isMenuDropdown && this.activeMenu) {
      this.closeAllMenus();
      this.returnFocusToEditor();
    }
  }

  /**
   * Handle keyboard navigation
   *
   * @param {Event} event - Keyboard event
   */
  handleKeyboard(event) {
    if (!this.activeMenu) return;

    switch (event.key) {
      case 'Escape':
        this.closeAllMenus();
        this.returnFocusToEditor();
        event.preventDefault();
        break;

      case 'ArrowDown':
        this.navigateMenu('down');
        event.preventDefault();
        break;

      case 'ArrowUp':
        this.navigateMenu('up');
        event.preventDefault();
        break;

      case 'Enter':
        this.activateCurrentItem();
        event.preventDefault();
        break;
    }
  }

  /**
   * Navigate within menu
   *
   * @param {string} direction - 'up' or 'down'
   */
  navigateMenu(direction) {
    const menu = this.menuElements.get(this.activeMenu);
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
    if (items[currentIndex]) {
      items[currentIndex].classList.add('hover');
      items[currentIndex].focus();
    }
  }

  /**
   * Activate currently focused menu item
   */
  activateCurrentItem() {
    const activeItem = document.querySelector('.menu-item.hover, .menu-item.active');
    if (activeItem) {
      activeItem.click();
    }
  }

  /**
   * Close all open menus
   */
  closeAllMenus() {
    this.menuElements.forEach((menu, name) => {
      menu.classList.add('hidden');

      const button = document.getElementById(`${name}-menu-button`);
      if (button) {
        button.classList.remove('bg-ui-active');
      }
    });

    this.activeMenu = null;
  }

  /**
   * Return focus to editor
   */
  returnFocusToEditor() {
    setTimeout(() => {
      const canvas = document.getElementById('notation-canvas');
      if (canvas) {
        canvas.focus();
      }
    }, FOCUS_RETURN_TIMEOUT_MS);
  }

  /**
   * Cleanup menu system
   */
  destroy() {
    document.removeEventListener('click', this.handleOutsideClick);
    document.removeEventListener('keydown', this.handleKeyboard);

    this.menuElements.forEach(menu => {
      const items = menu.querySelectorAll('.menu-item');
      items.forEach(item => {
        item.removeEventListener('click', this.handleMenuItemClick);
      });
    });

    this.menuElements.clear();
  }
}

export default MenuSystem;
export { MenuSystem };
