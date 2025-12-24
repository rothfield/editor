/**
 * ConsoleCoordinator - Manages console logging and error display
 *
 * Responsibilities:
 * - Error logging and display
 * - Warning logging and display
 * - General console logging
 * - Console entry creation and formatting
 * - Error pattern analysis
 * - Console history management
 *
 * This coordinator is independent and doesn't delegate to the editor.
 */

import { capitalizeFirst } from '../utils/string-utils.js';

interface ErrorInfo {
  message: string;
  timestamp: string;
  source: string;
  recoverable: boolean;
  details: string | null;
  type?: string;
  count?: number;
}

interface WarningInfo {
  message: string;
  timestamp: string;
  source: string;
  details: string | null;
  type?: string;
}

interface LogInfo {
  message: string;
  timestamp: string;
  source: string;
  details?: string | null;
}

interface ErrorOptions {
  source?: string;
  recoverable?: boolean;
  details?: string | null;
}

interface WarningOptions {
  source?: string;
  details?: string | null;
  important?: boolean;
}

// Minimal editor interface - ConsoleCoordinator is mostly independent
interface EditorInstance {
  // ConsoleCoordinator doesn't actually use any editor methods
}

export default class ConsoleCoordinator {
  private editor: EditorInstance;
  private errorHistory: ErrorInfo[];

  constructor(editor: EditorInstance) {
    this.editor = editor;
    this.errorHistory = [];
  }

  /**
   * Show error message with logging and notification
   */
  showError(message: string, options: ErrorOptions = {}): void {
    const errorInfo: ErrorInfo = {
      message,
      timestamp: new Date().toISOString(),
      source: options.source || 'Editor',
      recoverable: options.recoverable !== false,
      details: options.details || null
    };

    console.error(message, errorInfo);
    this.addToConsoleErrors(errorInfo);

    // Show user notification if recoverable
    if (errorInfo.recoverable) {
      this.showUserNotification(errorInfo);
    }

    this.recordError(errorInfo);
  }

  /**
   * Show warning message
   */
  showWarning(message: string, options: WarningOptions = {}): void {
    const warningInfo: WarningInfo = {
      message,
      timestamp: new Date().toISOString(),
      source: options.source || 'Editor',
      details: options.details || null
    };

    console.warn(message, warningInfo);
    this.addToConsoleWarnings(warningInfo);

    // Show user notification for important warnings
    if (options.important) {
      this.showUserNotification({
        ...warningInfo,
        type: 'warning'
      });
    }
  }

  /**
   * Add message to console errors with enhanced information
   */
  addToConsoleErrors(errorInfo: ErrorInfo): void {
    const errorsTab = document.getElementById('console-errors-list');
    if (errorsTab) {
      // Remove placeholder if this is the first real entry
      this.removePlaceholder(errorsTab);

      const errorElement = this.createConsoleEntry(errorInfo, 'error');
      errorsTab.appendChild(errorElement);
      errorsTab.scrollTop = errorsTab.scrollHeight;

      // Limit error history to prevent memory issues
      this.limitConsoleHistory(errorsTab, 100);
    }
  }

  /**
   * Add message to console warnings
   */
  addToConsoleWarnings(warningInfo: WarningInfo): void {
    const warningsTab = document.getElementById('console-warnings-list');
    if (warningsTab) {
      const warningElement = this.createConsoleEntry(warningInfo, 'warning');
      warningsTab.appendChild(warningElement);
      warningsTab.scrollTop = warningsTab.scrollHeight;

      // Limit warning history
      this.limitConsoleHistory(warningsTab, 50);
    }
  }

  /**
   * Add message to console log
   */
  addToConsoleLog(message: string | unknown): void {
    const logTab = document.getElementById('console-log-list');
    if (logTab) {
      // Remove placeholder if this is the first real entry
      this.removePlaceholder(logTab);

      const logElement = this.createConsoleEntry({
        message: typeof message === 'string' ? message : JSON.stringify(message),
        timestamp: new Date().toISOString(),
        source: 'Editor'
      }, 'log');

      logTab.appendChild(logElement);
      logTab.scrollTop = logTab.scrollHeight;

      // Limit log history
      this.limitConsoleHistory(logTab, 200);
    }
  }

  /**
   * Create console entry element
   */
  createConsoleEntry(info: LogInfo | ErrorInfo | WarningInfo, type: string): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `console-entry console-${type}`;

    const timestamp = new Date(info.timestamp || new Date().toISOString());
    const typeClass = type === 'error' ? 'text-error' : type === 'warning' ? 'text-warning' : 'text-info';

    element.innerHTML = `
            <span class="${typeClass}">${timestamp.toLocaleTimeString()}</span>
            <span class="font-medium">${capitalizeFirst(type)}:</span>
            <span>${info.message}</span>
            ${info.source ? `<span class="text-ui-disabled-text text-xs ml-2">(${info.source})</span>` : ''}
        `;

    // Add details if available
    if (info.details) {
      const detailsElement = document.createElement('details');
      detailsElement.className = 'console-details text-xs mt-1';
      detailsElement.innerHTML = `<summary>Details</summary><pre class="bg-ui-background p-1 rounded">${info.details}</pre>`;
      element.appendChild(detailsElement);
    }

    return element;
  }

  /**
   * Show user notification (DISABLED)
   */
  showUserNotification(info: ErrorInfo | WarningInfo): void {
    // Notification popups disabled - log to console instead
    console.log(`[${info.type || 'info'}] ${info.message}`);
  }

  /**
   * Remove placeholder text from console tabs
   */
  removePlaceholder(container: HTMLElement): void {
    // Check if the first child is a placeholder
    const firstChild = container.firstElementChild;
    if (firstChild && firstChild.textContent?.includes('No logs') ||
            firstChild && firstChild.textContent?.includes('No errors')) {
      container.removeChild(firstChild);
    }
  }

  /**
   * Limit console history to prevent memory issues
   */
  limitConsoleHistory(container: HTMLElement, maxEntries: number): void {
    const entries = container.children;
    while (entries.length > maxEntries) {
      container.removeChild(entries[0]);
    }
  }

  /**
   * Record error for performance monitoring
   */
  recordError(errorInfo: ErrorInfo): void {
    if (!this.errorHistory) {
      this.errorHistory = [];
    }

    this.errorHistory.push({
      ...errorInfo,
      count: 1
    });

    // Keep only last 100 errors
    if (this.errorHistory.length > 100) {
      this.errorHistory.shift();
    }

    // Check for error patterns
    this.analyzeErrorPatterns();
  }

  /**
   * Analyze error patterns for troubleshooting
   */
  analyzeErrorPatterns(): void {
    if (this.errorHistory.length < 5) return;

    // Check for repeated errors
    const errorCounts: Record<string, number> = {};
    this.errorHistory.forEach(error => {
      const key = error.message.substring(0, 50); // First 50 chars as key
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    });

    const repeatedErrors = Object.entries(errorCounts).filter(([_, count]) => count > 3);
    if (repeatedErrors.length > 0) {
      console.warn('Repeated error patterns detected:', repeatedErrors);
    }
  }
}
