/**
 * UI Components for Music Notation Editor
 *
 * This class provides UI components including menu system,
 * tab management, and user interface elements for the Music Notation Editor.
 */

class UI {
    constructor(editor) {
        this.editor = editor;
        this.activeMenu = null;
        this.activeTab = 'ephemeral';
        this.menuListeners = new Map();

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

        console.log('UI components initialized');
    }

    /**
     * Setup menu system
     */
    setupMenus() {
        // Setup File menu
        this.setupFileMenu();

        // Setup Line menu
        this.setupLineMenu();

        // Add menu toggle listeners
        document.getElementById('file-menu-button').addEventListener('click', () => {
            this.handleMenuToggle('file');
        });

        document.getElementById('line-menu-button').addEventListener('click', () => {
            this.handleMenuToggle('line');
        });
    }

    /**
     * Setup File menu
     */
    setupFileMenu() {
        const menuItems = [
            { id: 'menu-new', label: 'New', action: 'new-document' },
            { id: 'menu-open', label: 'Open...', action: 'open-document' },
            { id: 'menu-save', label: 'Save', action: 'save-document' },
            { id: 'menu-separator-1', label: null, separator: true },
            { id: 'menu-export-musicxml', label: 'Export MusicXML...', action: 'export-musicxml' },
            { id: 'menu-export-lilypond', label: 'Export LilyPond...', action: 'export-lilypond' },
            { id: 'menu-separator-2', label: null, separator: true },
            { id: 'menu-set-title', label: 'Set Title...', action: 'set-title' },
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
        this.switchTab('ephemeral');
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
    handleMenuToggle(menuName) {
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
    switchTab(tabName) {
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

        // Request focus return to editor
        this.returnFocusToEditor();
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
            case 'export-musicxml':
                this.exportMusicXML();
                break;
            case 'export-lilypond':
                this.exportLilyPond();
                break;
            case 'set-title':
                this.setTitle();
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
                    this.editor.showError('Failed to open document file');
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
                a.download = this.getDocumentTitle() + '.json';
                a.click();

                URL.revokeObjectURL(url);
                this.editor.addToConsoleLog(`Document saved: ${this.getDocumentTitle()}.json`);
            } catch (error) {
                console.error('Failed to save document:', error);
                this.editor.showError('Failed to save document');
            }
        }
    }

    /**
     * Export to MusicXML (stub)
     */
    exportMusicXML() {
        this.showStubMessage('MusicXML export is not implemented in this POC');
    }

    /**
     * Export to LilyPond (stub)
     */
    exportLilyPond() {
        this.showStubMessage('LilyPond export is not implemented in this POC');
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
    setTitle() {
        const currentTitle = this.getDocumentTitle();
        const newTitle = prompt('Enter document title:', currentTitle);

        if (newTitle !== null && newTitle.trim() !== '') {
            this.updateDocumentTitle(newTitle);

            if (this.editor && this.editor.document) {
                this.editor.document.metadata.title = newTitle;
                this.editor.addToConsoleLog(`Document title set to: ${newTitle}`);
            }
        }
    }

    /**
     * Set tonic
     */
    setTonic() {
        const currentTonic = this.getTonic();
        const newTonic = prompt('Enter tonic (C, D, E, F, G, A, B):', currentTonic);

        if (newTonic !== null && newTonic.trim() !== '') {
            this.updateTonicDisplay(newTonic);

            if (this.editor && this.editor.document) {
                this.editor.document.metadata.tonic = newTonic;
                this.editor.addToConsoleLog(`Document tonic set to: ${newTonic}`);
            }
        }
    }

    /**
     * Set pitch system
     */
    setPitchSystem() {
        const currentSystem = this.getCurrentPitchSystem();
        const newSystem = this.showPitchSystemDialog(currentSystem);

        if (newSystem !== null) {
            this.updatePitchSystemDisplay(newSystem);

            if (this.editor) {
                this.editor.setPitchSystem(newSystem);
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

        if (choice !== null) {
            const system = parseInt(choice);
            if (system >= 1 && system <= 3) {
                return system;
            }
        }

        return currentSystem;
    }

    /**
     * Set key signature
     */
    setKeySignature() {
        const currentSignature = this.getKeySignature();
        const newSignature = prompt('Enter key signature (e.g., C, G, D major, etc.):', currentSignature);

        if (newSignature !== null && newSignature.trim() !== '') {
            this.updateKeySignatureDisplay(newSignature);

            if (this.editor && this.editor.document) {
                this.editor.document.metadata.key_signature = newSignature;
                this.editor.addToConsoleLog(`Document key signature set to: ${newSignature}`);
            }
        }
    }

    /**
     * Set line label
     */
    setLabel() {
        const currentLabel = this.getLineLabel();
        const newLabel = prompt('Enter line label:', currentLabel);

        if (newLabel !== null && newLabel.trim() !== '') {
            this.updateLineLabelDisplay(newLabel);

            if (this.editor && this.editor.document && this.editor.document.lines.length > 0) {
                this.editor.document.lines[0].metadata.label = newLabel;
                this.editor.addToConsoleLog(`Line label set to: ${newLabel}`);
            }
        }
    }

    /**
     * Set line tonic
     */
    setLineTonic() {
        const currentTonic = this.getLineTonic();
        const newTonic = prompt('Enter line tonic (C, D, E, F, G, A, B):', currentTonic);

        if (newTonic !== null && newTonic.trim() !== '') {
            this.updateLineTonicDisplay(newTonic);

            if (this.editor && this.editor.document && this.editor.document.lines.length > 0) {
                this.editor.document.lines[0].metadata.tonic = newTonic;
                this.editor.addToConsoleLog(`Line tonic set to: ${newTonic}`);
            }
        }
    }

    /**
     * Set line pitch system
     */
    setLinePitchSystem() {
        const currentSystem = this.getLinePitchSystem();
        const newSystem = this.showPitchSystemDialog(currentSystem);

        if (newSystem !== null) {
            this.updateLinePitchSystemDisplay(newSystem);

            if (this.editor && this.editor.document && this.editor.document.lines.length > 0) {
                this.editor.document.lines[0].metadata.pitch_system = newSystem;
                this.editor.addToConsoleLog(`Line pitch system set to: ${this.getPitchSystemName(newSystem)}`);
            }
        }
    }

    /**
     * Set lyrics
     */
    setLyrics() {
        const currentLyrics = this.getLyrics();
        const newLyrics = prompt('Enter lyrics:', currentLyrics);

        if (newLyrics !== null && newLyrics.trim() !== '') {
            this.updateLyricsDisplay(newLyrics);

            if (this.editor && this.editor.document && this.editor.document.lines.length > 0) {
                this.editor.document.lines[0].metadata.lyrics = newLyrics;
                this.editor.addToConsoleLog(`Lyrics set to: ${newLyrics}`);
            }
        }
    }

    /**
     * Set tala
     */
    setTala() {
        const currentTala = this.getTala();
        const newTala = prompt('Enter tala (digits 0-9+):', currentTala);

        if (newTala !== null && newTala.trim() !== '') {
            // Validate tala input
            if (this.validateTalaInput(newTala)) {
                this.updateTalaDisplay(newTala);

                if (this.editor) {
                    this.editor.setTala(newTala);
                }
            } else {
                this.editor?.showError('Invalid tala format. Only digits 0-9 and + are allowed.');
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
    setLineKeySignature() {
        const currentSignature = this.getLineKeySignature();
        const newSignature = prompt('Enter line key signature:', currentSignature);

        if (newSignature !== null && newSignature.trim() !== '') {
            this.updateLineKeySignatureDisplay(newSignature);

            if (this.editor && this.editor.document && this.editor.document.lines.length > 0) {
                this.editor.document.lines[0].metadata.key_signature = newSignature;
                this.editor.addToConsoleLog(`Line key signature set to: ${newSignature}`);
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
     * Return focus to editor canvas
     */
    returnFocusToEditor() {
        // Use setTimeout to ensure any dialogs/prompts have closed first
        setTimeout(() => {
            const canvas = document.getElementById('notation-canvas');
            if (canvas) {
                canvas.focus();
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
            // Only return focus if clicking on the editor canvas
            if (event.target.closest('#notation-canvas, #editor-container')) {
                this.returnFocusToEditor();
            }
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
            currentIndex = currentIndex - 1;
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
     * Getters
     */
    getDocumentTitle() {
        return this.editor?.document?.metadata?.title || 'Untitled Document';
    }

    getTonic() {
        return this.editor?.document?.metadata?.tonic || '';
    }

    getCurrentPitchSystem() {
        return this.editor?.document?.metadata?.pitch_system || 1;
    }

    getKeySignature() {
        return this.editor?.document?.metadata?.key_signature || '';
    }

    getLineLabel() {
        if (this.editor?.document?.lines?.length > 0) {
            return this.editor.document.lines[0].metadata.label || '';
        }
        return '';
    }

    getLineTonic() {
        if (this.editor?.document?.lines?.length > 0) {
            return this.editor.document.lines[0].metadata.tonic || '';
        }
        return '';
    }

    getLinePitchSystem() {
        if (this.editor?.document?.lines?.length > 0) {
            return this.editor.document.lines[0].metadata.pitch_system || 1;
        }
        return 1;
    }

    getLyrics() {
        if (this.editor?.document?.lines?.length > 0) {
            return this.editor.document.lines[0].metadata.lyrics || '';
        }
        return '';
    }

    getTala() {
        return this.editor?.document?.lines?.length > 0 ?
            this.editor.document.lines[0].metadata.tala || '' : '';
    }

    getLineKeySignature() {
        if (this.editor?.document?.lines?.length > 0) {
            return this.editor.document.lines[0].metadata.key_signature || '';
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
}

export default UI;