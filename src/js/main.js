/**
 * Music Notation Editor - Main Application Entry Point
 *
 * This is the main entry point for the Music Notation Editor POC.
 * It initializes the editor, sets up global event handlers, and manages
 * the application lifecycle.
 */

import MusicNotationEditor from './editor.js';
import EventManager from './events.js';
import { FileOperations } from './file-ops.js';
import UI from './ui.js';
import ResizeHandle from './resize-handle.js';
import LilyPondTab from './lilypond-tab.js';
import LilyPondPngTab from './lilypond-png-tab.js';
import LilyPondRenderer from './lilypond-renderer.js';
import ExportUI from './export-ui.js';
import PreferencesUI from './preferences.js';
import { FontTestUI } from './font-test.js';

/**
 * Main application class
 */
class MusicNotationApp {
  constructor() {
    this.editor = null;
    this.eventManager = null;
    this.fileOperations = null;
    this.ui = null;
    this.exportUI = null;
    this.preferencesUI = null;
    this.resizeHandle = null;
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

      // Get the editor element
      const editorElement = document.getElementById('notation-editor');
      if (!editorElement) {
        throw new Error('Editor element not found');
      }

      // Initialize core components
      this.editor = new MusicNotationEditor(editorElement);
      this.fileOperations = new FileOperations(this.editor);
      this.eventManager = new EventManager(this.editor, this.fileOperations);
      this.preferencesUI = new PreferencesUI(this.editor);
      this.ui = new UI(this.editor, this.fileOperations, this.preferencesUI);
      this.exportUI = new ExportUI(this.editor, this.fileOperations);
      this.resizeHandle = new ResizeHandle();

      // Pass references to editor so it can access other components
      this.editor.ui = this.ui;
      this.editor.exportUI = this.exportUI;
      this.editor.eventManager = this.eventManager;
      this.editor.preferencesUI = this.preferencesUI;

      // ⚡ CRITICAL: Attach keyboard listeners EARLY (before WASM initialization)
      // This ensures users can type immediately on page load without losing keystrokes
      this.eventManager.attachEarlyKeyboardListeners();

      // Initialize the editor (loads WASM module asynchronously)
      await this.editor.initialize();

      // Setup MIDI controls
      this.setupMidiControls();

      // Initialize other components
      this.eventManager.initialize();
      this.fileOperations.initialize();
      this.preferencesUI.initialize();
      this.ui.initialize();
      this.resizeHandle.initialize();

      // Initialize Font Test UI
      this.fontTestUI = new FontTestUI();

      // Setup resize redraw callback for OSMD/VexFlow renderer
      this.setupResizeRedraw();

      // Setup collapse button
      this.setupPanelCollapseButton();

      // Setup hot reload toggle
      this.setupHotReloadToggle();

      // Initialize LilyPond tabs
      this.initializeLilyPondTabs();

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
    const editorElement = document.getElementById('notation-editor');
    if (editorElement) {
      editorElement.innerHTML = `
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
     * Focus the editor element
     */
  focusEditor() {
    const editorElement = document.getElementById('notation-editor');
    if (editorElement) {
      editorElement.focus();
    }
  }

  /**
   * Initialize LilyPond tabs
   */
  initializeLilyPondTabs() {
    try {
      // Initialize LilyPond Source tab (displays source code)
      const lilypondSrcTab = new LilyPondTab(this.editor);
      lilypondSrcTab.initialize();
      console.log('✅ LilyPond Source tab initialized');

      // Initialize LilyPond PNG tab (displays rendered PNG/SVG)
      const lilypondRenderer = new LilyPondRenderer();
      const lilypondPngTab = new LilyPondPngTab(this.editor, lilypondRenderer);
      lilypondPngTab.initialize();
      console.log('✅ LilyPond PNG tab initialized');
    } catch (error) {
      console.error('Failed to initialize LilyPond tabs:', error);
    }
  }

  /**
     * Setup MIDI playback controls
     */
  setupMidiControls() {
    const playButton = document.getElementById('midi-play');
    const pauseButton = document.getElementById('midi-pause');
    const stopButton = document.getElementById('midi-stop');
    const tempoInput = document.getElementById('midi-tempo');
    const statusSpan = document.getElementById('midi-status');

    if (!playButton || !pauseButton || !stopButton || !tempoInput || !statusSpan) {
      console.warn('MIDI controls not found in DOM');
      return;
    }

    // Play button
    playButton.addEventListener('click', async () => {
      try {
        console.log('🎵 Play button clicked');

        if (!this.editor || !this.editor.osmdRenderer) {
          statusSpan.textContent = 'Error: Editor not ready';
          console.error('OSMD renderer not initialized');
          return;
        }

        console.log('🎵 Initializing audio player...');
        // Initialize audio player on first play (requires user gesture for AudioContext)
        await this.editor.osmdRenderer.initAudioPlayer();

        const audioPlayer = this.editor.osmdRenderer.audioPlayer;
        if (!audioPlayer) {
          statusSpan.textContent = 'Error: Audio player not ready';
          console.error('Audio player failed to initialize');
          return;
        }

        console.log('🎵 Audio player ready, calling play()...');
        console.log('🎵 Audio player state before play:', audioPlayer.state);
        console.log('🎵 Audio player ready flag:', audioPlayer.ready);

        statusSpan.textContent = 'Playing...';
        await audioPlayer.play();

        console.log('🎵 Play() completed. State:', audioPlayer.state);

        playButton.disabled = true;
        pauseButton.disabled = false;
        stopButton.disabled = false;
      } catch (error) {
        console.error('❌ Failed to start playback:', error);
        console.error('Error stack:', error.stack);
        statusSpan.textContent = 'Error: ' + error.message;
      }
    });

    // Pause button
    pauseButton.addEventListener('click', () => {
      if (this.editor && this.editor.osmdRenderer && this.editor.osmdRenderer.audioPlayer) {
        this.editor.osmdRenderer.audioPlayer.pause();
        statusSpan.textContent = 'Paused';

        playButton.disabled = false;
        pauseButton.disabled = true;
      }
    });

    // Stop button
    stopButton.addEventListener('click', () => {
      if (this.editor && this.editor.osmdRenderer && this.editor.osmdRenderer.audioPlayer) {
        this.editor.osmdRenderer.audioPlayer.stop();
        statusSpan.textContent = 'Ready';

        playButton.disabled = false;
        pauseButton.disabled = true;
        stopButton.disabled = true;
      }
    });

    // Tempo input
    tempoInput.addEventListener('change', (e) => {
      const tempo = parseInt(e.target.value, 10);
      if (this.editor && this.editor.osmdRenderer && this.editor.osmdRenderer.audioPlayer && !isNaN(tempo)) {
        this.editor.osmdRenderer.audioPlayer.setBpm(tempo);
        statusSpan.textContent = `Tempo set to ${tempo} BPM`;
      }
    });

    // Volume control
    const volumeSlider = document.getElementById('midi-volume');
    const volumeLabel = document.getElementById('midi-volume-label');
    if (volumeSlider && volumeLabel) {
      volumeSlider.addEventListener('input', (e) => {
        const volume = parseInt(e.target.value, 10) / 100; // Convert to 0-1 range
        volumeLabel.textContent = `${e.target.value}%`;

        if (this.editor && this.editor.osmdRenderer && this.editor.osmdRenderer.audioPlayer) {
          this.editor.osmdRenderer.audioPlayer.playbackSettings.masterVolume = volume;
          console.log('🔊 Volume set to:', volume);
        }
      });
    }

    console.log('✅ MIDI controls initialized');
  }

  /**
   * Setup resize redraw callback for OSMD/VexFlow renderer
   * Ensures the staff notation (and other visual tabs) redraw when the inspector pane is resized
   */
  setupResizeRedraw() {
    if (!this.resizeHandle || !this.editor) {
      console.warn('Resize handle or editor not available for resize redraw setup');
      return;
    }

    console.log('🟢 [Main] Setting up resize callback...');

    this.resizeHandle.setOnResizeEnd(() => {
      try {
        console.log('🟢 [Main] ===== RESIZE CALLBACK FIRED =====');
        console.log('🟢 [Main] Panel resized, triggering redraw...');

        // Get the currently active tab
        const activeTabButton = document.querySelector('[data-tab].active');
        if (!activeTabButton) {
          console.log('🟡 [Main] No active tab found');
          return;
        }

        const activeTabName = activeTabButton?.dataset?.tab;
        if (!activeTabName) {
          console.log('🟡 [Main] Active tab has no data-tab attribute');
          return;
        }

        console.log('🟢 [Main] Active tab:', activeTabName);

        // Redraw based on which tab is active
        if (activeTabName === 'staff-notation') {
          console.log('🟢 [Main] Staff notation tab is active, will redraw');

          if (!this.editor || !this.editor.osmdRenderer) {
            console.warn('🔴 [Main] Editor or OSMD renderer not available');
            console.log('   this.editor:', !!this.editor);
            console.log('   this.editor.osmdRenderer:', !!this.editor?.osmdRenderer);
            return;
          }

          console.log('🟢 [Main] Editor and OSMD renderer available');

          // Wait for DOM to settle after resize, then force complete re-render
          console.log('🟢 [Main] Setting 50ms timeout for DOM to settle...');
          setTimeout(() => {
            try {
              console.log('🟢 [Main] Timeout fired, starting redraw...');

              // Verify container still exists
              const container = document.getElementById('staff-notation-container');
              if (!container) {
                console.error('🔴 [Main] Staff notation container not found in DOM');
                return;
              }

              console.log('🟢 [Main] Container found, width:', container.offsetWidth, 'px');
              console.log('🟢 [Main] Triggering OSMD re-render with new container dimensions');

              // Force complete re-render by:
              // 1. Clear IndexedDB cache (cached SVG has wrong width)
              console.log('🟢 [Main] Clearing OSMD IndexedDB cache...');
              this.editor.osmdRenderer.clearAllCache().then(() => {
                console.log('🟢 [Main] Cache cleared');
              });

              // 2. Clear the hash cache so render() doesn't skip
              const oldHash = this.editor.osmdRenderer.lastMusicXmlHash;
              this.editor.osmdRenderer.lastMusicXmlHash = null;
              console.log('🟢 [Main] Cleared hash cache (was:', oldHash, ')');

              // 3. Reset the OSMD instance to pick up new container dimensions
              this.editor.osmdRenderer.osmd = null;
              console.log('🟢 [Main] Reset OSMD instance to null');

              // 4. Trigger full re-render
              console.log('🟢 [Main] Calling renderStaffNotation()...');
              this.editor.renderStaffNotation()
                .then(() => {
                  console.log('✅ [Main] Staff notation re-rendered successfully!');
                })
                .catch(err => {
                  console.error('🔴 [Main] Failed to redraw staff notation:', err);
                });
            } catch (innerErr) {
              console.error('🔴 [Main] Error in delayed redraw callback:', innerErr);
            }
          }, 50); // Small delay to ensure container has new dimensions
        } else {
          console.log('🟡 [Main] Active tab is not staff-notation, skipping redraw');
        }
        // Add other tab redraw logic here as needed
        // For example: LilyPond PNG, etc.
      } catch (err) {
        console.error('[Resize] Error in resize callback:', err);
      }
    });

    console.log('Resize redraw callback setup complete');
  }

  /**
     * Setup panel collapse/expand button
     */
  setupPanelCollapseButton() {
    const collapseBtn = document.getElementById('panel-collapse-btn');

    if (!collapseBtn) {
      console.warn('Panel collapse button not found in DOM');
      return;
    }

    collapseBtn.addEventListener('click', () => {
      if (this.resizeHandle) {
        this.resizeHandle.toggleCollapse();
        // Update body class to reflect collapsed state (for CSS styling)
        if (this.resizeHandle.getIsCollapsed()) {
          document.body.classList.add('panel-collapsed');
        } else {
          document.body.classList.remove('panel-collapsed');
        }
      }
    });

    // Initialize body class based on current state
    if (this.resizeHandle && this.resizeHandle.getIsCollapsed()) {
      document.body.classList.add('panel-collapsed');
    }

    console.log('✅ Panel collapse button initialized');
  }

  /**
     * Setup hot reload toggle button
     */
  setupHotReloadToggle() {
    const toggleBtn = document.getElementById('hotreload-toggle');
    const statusSpan = document.getElementById('hotreload-status');

    if (!toggleBtn || !statusSpan) {
      console.warn('Hot reload toggle button or status not found in DOM');
      return;
    }

    // Wait for hot reload functions to be available (injected by dev-server)
    const waitForHotReload = () => {
      return new Promise((resolve) => {
        if (window.toggleHotReload && window.isHotReloadEnabled) {
          resolve();
          return;
        }

        let attempts = 0;
        const maxAttempts = 40; // 2 seconds at 50ms intervals
        const checkInterval = setInterval(() => {
          attempts++;
          if (window.toggleHotReload && window.isHotReloadEnabled) {
            clearInterval(checkInterval);
            resolve();
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('Hot reload functions not available after 2 seconds (probably not in dev environment)');
            resolve(); // Continue anyway, with graceful degradation
          }
        }, 50);
      });
    };

    // Initialize when functions are available
    waitForHotReload().then(() => {
      // Update UI based on current state
      const updateUI = () => {
        const enabled = window.isHotReloadEnabled?.() ?? true;
        statusSpan.textContent = enabled ? 'ON' : 'OFF';
        toggleBtn.style.opacity = enabled ? '1' : '0.6';
        toggleBtn.style.color = enabled ? 'inherit' : '#9ca3af';
      };

      // Initial UI update
      updateUI();

      // Toggle hot reload on button click
      toggleBtn.addEventListener('click', () => {
        if (window.toggleHotReload) {
          try {
            window.toggleHotReload();
            updateUI();
            const enabled = window.isHotReloadEnabled?.() ?? true;
            console.log(`🔄 Hot reload ${enabled ? 'enabled' : 'disabled'}`);
          } catch (error) {
            console.error('❌ Failed to toggle hot reload:', error);
          }
        } else {
          console.warn('Hot reload not available (not in dev environment)');
        }
      });

      console.log('✅ Hot reload toggle initialized');
    });
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
        'Cell-based architecture',
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
      })
        .catch(error => {
          console.error('Failed to initialize application:', error);
        });
    });
  } else {
    AppFactory.init().then(app => {
      appInstance = app;
      console.log('Application ready');
    })
      .catch(error => {
        console.error('Failed to initialize application:', error);
      });
  }
}

/**
 * Setup keyboard shortcuts for debugging/testing
 */
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (event) => {
    // Ctrl+Alt+N: Toggle notation font test mode on editor-container
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      const editorContainer = document.getElementById('editor-container');
      if (editorContainer) {
        editorContainer.classList.toggle('notation-font-test');
        const isActive = editorContainer.classList.contains('notation-font-test');
        const status = isActive ? 'ON' : 'OFF';
        console.log(`Notation Font Test Mode: ${status}`);

        // Update status indicator if available
        const statusEl = document.getElementById('notation-font-test-status');
        if (statusEl) {
          statusEl.textContent = `Notation Font: ${status}`;
          statusEl.style.color = isActive ? '#10b981' : '#6b7280';
        }
      }
    }
  });
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

    const state = appInstance.editor.theDocument;
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
 * Backwards compatibility: expose editor directly
 * Some tests may still use window.musicEditor
 */
Object.defineProperty(window, 'musicEditor', {
  get() {
    return appInstance?.editor;
  }
});

/**
 * Auto-initialize the application
 */
setupGlobalErrorHandlers();
setupKeyboardShortcuts();
initializeApp();

/**
 * Export main class for external use
 */
export default MusicNotationApp;
export { AppFactory, DevUtils };
