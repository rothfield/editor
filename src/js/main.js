/**
 * Music Notation Editor - Main Application Entry Point
 *
 * This is the main entry point for the Music Notation Editor POC.
 * It initializes the editor, sets up global event handlers, and manages
 * the application lifecycle.
 */

import MusicNotationEditor from './editor.js';
import { EventManager } from './events.js';
import { FileOperations } from './file-ops.js';
import { UI } from './ui.js';

/**
 * Main application class
 */
class MusicNotationApp {
    constructor() {
        this.editor = null;
        this.eventManager = null;
        this.fileOperations = null;
        this.ui = null;
        this.isInitialized = false;

        // Bind methods to maintain context
        this.handleDOMContentLoaded = this.handleDOMContentLoaded.bind(this);
        this.handleError = this.handleError.bind(this);
        this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this);
    }

    /**
     * Initialize the application
     */
    async initialize() {
        try {
            console.log('🎵 Starting Music Notation Editor POC...');

            // Get the editor canvas element
            const canvas = document.getElementById('notation-canvas');
            if (!canvas) {
                throw new Error('Editor canvas element not found');
            }

            // Initialize core components
            this.editor = new MusicNotationEditor(canvas);
            this.eventManager = new EventManager(this.editor);
            this.fileOperations = new FileOperations(this.editor);
            this.ui = new UI(this.editor);

            // Initialize the editor
            await this.editor.initialize();

            // Initialize other components
            this.eventManager.initialize();
            this.fileOperations.initialize();
            this.ui.initialize();

            this.isInitialized = true;

            // Set initial focus
            this.focusEditor();

            // Log successful initialization
            console.log('✅ Music Notation Editor POC initialized successfully');
            this.showStartupMessage();

        } catch (error) {
            console.error('❌ Failed to initialize application:', error);
            this.handleInitializationError(error);
            throw error;
        }
    }

    /**
     * Handle DOM content loaded event
     */
    async handleDOMContentLoaded() {
        try {
            await this.initialize();
        } catch (error) {
            console.error('Application initialization failed:', error);
        }
    }

    /**
     * Handle global errors
     */
    handleError(event) {
        console.error('Global error:', event.error || event.message);

        if (this.editor) {
            this.editor.addToConsoleErrors(`Global error: ${event.error?.message || event.message}`);
        }

        // Prevent default error handling for better debugging
        event.preventDefault();
    }

    /**
     * Handle unhandled promise rejections
     */
    handleUnhandledRejection(event) {
        console.error('Unhandled promise rejection:', event.reason);

        if (this.editor) {
            this.editor.addToConsoleErrors(`Promise rejection: ${event.reason?.message || event.reason}`);
        }

        // Prevent default error handling
        event.preventDefault();
    }

    /**
     * Handle initialization errors
     */
    handleInitializationError(error) {
        const canvas = document.getElementById('notation-canvas');
        if (canvas) {
            canvas.innerHTML = `
                <div class="error p-4 text-center">
                    <h3 class="text-lg font-semibold text-error mb-2">Failed to Initialize Editor</h3>
                    <p class="text-sm mb-2">${error.message}</p>
                    <button onclick="location.reload()" class="px-4 py-2 bg-ui-active rounded text-sm">
                        Reload Page
                    </button>
                </div>
            `;
        }
    }

    /**
     * Show startup message
     */
    showStartupMessage() {
        if (this.editor) {
            this.editor.addToConsoleLog('🎵 Music Notation Editor POC started');
            this.editor.addToConsoleLog('📝 Type musical notation to begin (Number system: 1-7, Western: cdefgab)');
            this.editor.addToConsoleLog('⌨️  Use Alt+S for slurs, Alt+U/M/L for octaves, Alt+T for tala');
            this.editor.addToConsoleLog('🎯 Ready for musical input!');
        }
    }

    /**
     * Focus the editor canvas
     */
    focusEditor() {
        const canvas = document.getElementById('notation-canvas');
        if (canvas) {
            canvas.focus();
        }
    }

    /**
     * Get application info
     */
    getInfo() {
        return {
            name: 'Music Notation Editor POC',
            version: '0.1.0',
            initialized: this.isInitialized,
            features: [
                'Number and Western pitch systems',
                'CharCell-based architecture',
                'Real-time beat derivation',
                'Selection-based commands',
                'WASM performance optimization'
            ]
        };
    }
}

/**
 * Application factory and initialization
 */
class AppFactory {
    static create() {
        const app = new MusicNotationApp();
        return app;
    }

    static async init() {
        const app = AppFactory.create();
        await app.initialize();
        return app;
    }
}

/**
 * Global application instance
 */
let appInstance = null;

/**
 * Initialize application when DOM is ready
 */
function initializeApp() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            AppFactory.init().then(app => {
                appInstance = app;
                console.log('Application ready');
            }).catch(error => {
                console.error('Failed to initialize application:', error);
            });
        });
    } else {
        AppFactory.init().then(app => {
            appInstance = app;
            console.log('Application ready');
        }).catch(error => {
            console.error('Failed to initialize application:', error);
        });
    }
}

/**
 * Setup global error handlers
 */
function setupGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
        if (appInstance) {
            appInstance.handleError(event);
        } else {
            console.error('Error before app initialization:', event.error);
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        if (appInstance) {
            appInstance.handleUnhandledRejection(event);
        } else {
            console.error('Unhandled rejection before app initialization:', event.reason);
        }
    });
}

/**
 * Development utilities
 */
const DevUtils = {
    /**
     * Get current application state
     */
    getAppState() {
        if (!appInstance) {
            return { error: 'Application not initialized' };
        }

        return {
            app: appInstance.getInfo(),
            editor: {
                initialized: appInstance.editor?.isInitialized || false,
                document: appInstance.editor?.document || null,
                cursor: appInstance.editor?.getCursorPosition() || 0
            }
        };
    },

    /**
     * Performance monitoring
     */
    getPerformanceStats() {
        if (!appInstance || !appInstance.editor) {
            return { error: 'Performance stats not available' };
        }

        return appInstance.editor.getPerformanceStats();
    },

    /**
     * Test musical notation parsing
     */
    async testNotation(notation) {
        if (!appInstance || !appInstance.editor) {
            console.error('Editor not available for testing');
            return;
        }

        console.log(`Testing notation: "${notation}"`);
        await appInstance.editor.parseText(notation);

        const state = appInstance.editor.document;
        console.log('Parsed state:', state);
    },

    /**
     * Export document
     */
    async exportDocument() {
        if (!appInstance || !appInstance.editor) {
            console.error('Editor not available for export');
            return;
        }

        try {
            const docState = await appInstance.editor.saveDocument();
            const blob = new Blob([docState], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'music-notation-export.json';
            a.click();

            URL.revokeObjectURL(url);
            console.log('Document exported successfully');
        } catch (error) {
            console.error('Failed to export document:', error);
        }
    }
};

/**
 * Expose utilities for development and debugging
 */
window.MusicNotationApp = {
    app: () => appInstance,
    utils: DevUtils,
    init: initializeApp
};

/**
 * Auto-initialize the application
 */
setupGlobalErrorHandlers();
initializeApp();

/**
 * Export main class for external use
 */
export default MusicNotationApp;
export { AppFactory, DevUtils };