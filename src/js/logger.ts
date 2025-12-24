/**
 * Logging utility for the Music Notation Editor
 *
 * Provides structured logging with categories, timing, and context
 */

type LogLevel = 0 | 1 | 2 | 3 | 4;

const LOG_LEVELS: Record<string, LogLevel> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

const LOG_CATEGORIES = {
  EDITOR: 'Editor',
  PARSER: 'Parser',
  RENDERER: 'Renderer',
  UI: 'UI',
  SELECTION: 'Selection',
  CURSOR: 'Cursor',
  COMMAND: 'Command',
  PERFORMANCE: 'Performance',
  SERVER_DEV: 'ServerDev',
  WASM: 'WASM',
  KEYBOARD: 'Keyboard',
  MUSICAL: 'Musical',
  INSPECTOR: 'Inspector',
  AUTOSAVE: 'Autosave',
  EVENTS: 'Events',
  INITIALIZATION: 'Initialization',
  EXPORT: 'Export',
  FOCUS: 'Focus',
  FILE: 'File',
  APP: 'App',
  OSMD: 'OSMD',
  STORAGE: 'Storage',
  GUTTER: 'Gutter',
  DIAGNOSTICS: 'Diagnostics',
  DEBUG: 'Debug',
  PREFERENCES: 'Preferences',
  MENU: 'Menu',
  LILYPOND: 'LilyPond',
  PLAYBACK: 'Playback'
} as const;

type LogCategory = typeof LOG_CATEGORIES[keyof typeof LOG_CATEGORIES];

class Logger {
  private level: LogLevel;
  private enabledCategories: Set<string>;
  private timers: Map<string, number>;

  constructor() {
    // In production, set level to WARN (only errors and warnings)
    // In development, set to DEBUG for more visibility
    // Check if running in Node.js (process exists) or browser (localhost)
    const isProduction = typeof process !== 'undefined'
      ? process.env?.NODE_ENV === 'production'
      : !(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    this.level = isProduction ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;
    this.enabledCategories = new Set(Object.values(LOG_CATEGORIES));
    this.timers = new Map();
  }

  /**
   * Set the logging level
   */
  setLevel(level: LogLevel | string): void {
    if (typeof level === 'string') {
      this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
    } else {
      this.level = level;
    }
  }

  /**
   * Enable/disable specific categories
   */
  enableCategory(category: string): void {
    this.enabledCategories.add(category);
  }

  disableCategory(category: string): void {
    this.enabledCategories.delete(category);
  }

  /**
   * Check if a level is enabled
   */
  shouldLog(level: LogLevel, category: string): boolean {
    return level <= this.level && this.enabledCategories.has(category);
  }

  /**
   * Format a log message
   */
  format(category: string, level: LogLevel, message: string, context: Record<string, unknown> = {}): string {
    const timestamp = new Date().toISOString()
      .split('T')[1].slice(0, -1);

    let formatted = `[${timestamp}] [${category}] ${message}`;

    if (Object.keys(context).length > 0) {
      try {
        // Use a replacer to handle circular references and non-serializable objects
        const seen = new WeakSet();
        const contextStr = JSON.stringify(context, (key, value) => {
          // Handle Error objects specially
          if (value instanceof Error) {
            return { message: value.message, stack: value.stack };
          }
          // Skip circular references
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        });
        formatted += ` ${contextStr}`;
      } catch (e) {
        // Fallback if stringify still fails
        formatted += ` [Object with non-serializable content]`;
      }
    }

    return formatted;
  }

  /**
   * Log an error
   */
  error(category: string, message: string, context: unknown = {}): void {
    if (this.shouldLog(LOG_LEVELS.ERROR, category)) {
      const ctx = context instanceof Error
        ? { error: context.message, stack: context.stack }
        : (context as Record<string, unknown>);
      const formatted = this.format(category, LOG_LEVELS.ERROR, message, ctx);
      console.error(`🔴 ${formatted}`);
    }
  }

  /**
   * Log a warning
   */
  warn(category: string, message: string, context: unknown = {}): void {
    if (this.shouldLog(LOG_LEVELS.WARN, category)) {
      const formatted = this.format(category, LOG_LEVELS.WARN, message, context as Record<string, unknown>);
      console.warn(`⚠️  ${formatted}`);
    }
  }

  /**
   * Log an info message
   */
  info(category: string, message: string, context: unknown = {}): void {
    if (this.shouldLog(LOG_LEVELS.INFO, category)) {
      const formatted = this.format(category, LOG_LEVELS.INFO, message, context as Record<string, unknown>);
      console.info(`ℹ️  ${formatted}`);
    }
  }

  /**
   * Log a debug message
   */
  debug(category: string, message: string, context: unknown = {}): void {
    if (this.shouldLog(LOG_LEVELS.DEBUG, category)) {
      const formatted = this.format(category, LOG_LEVELS.DEBUG, message, context as Record<string, unknown>);
      console.log(`🐛 ${formatted}`);
    }
  }

  /**
   * Log a trace message
   */
  trace(category: string, message: string, context: unknown = {}): void {
    if (this.shouldLog(LOG_LEVELS.TRACE, category)) {
      const formatted = this.format(category, LOG_LEVELS.TRACE, message, context as Record<string, unknown>);
      console.log(`🔍 ${formatted}`);
    }
  }

  /**
   * Start a timer for performance measurement
   */
  time(label: string, category: string = LOG_CATEGORIES.PERFORMANCE): void {
    const id = `${category}:${label}`;
    this.timers.set(id, performance.now());
    this.trace(category, `Timer started: ${label}`);
  }

  /**
   * End a timer and log the duration
   */
  timeEnd(label: string, category: string = LOG_CATEGORIES.PERFORMANCE, context: Record<string, unknown> = {}): number | null {
    const id = `${category}:${label}`;
    const startTime = this.timers.get(id);

    if (startTime !== undefined) {
      const duration = performance.now() - startTime;
      this.timers.delete(id);

      this.info(category, `${label} completed`, {
        duration: `${duration.toFixed(2)}ms`,
        ...context
      });

      return duration;
    } else {
      this.warn(category, `Timer not found: ${label}`);
      return null;
    }
  }

  /**
   * Log an operation with automatic timing
   */
  async logOperation<T>(category: string, operation: string, fn: () => Promise<T>, context: Record<string, unknown> = {}): Promise<T> {
    this.time(operation, category);
    try {
      const result = await fn();
      this.timeEnd(operation, category, { ...context, status: 'success' });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.timeEnd(operation, category, { ...context, status: 'error', error: errorMessage });
      this.error(category, `${operation} failed`, { error: errorMessage, stack: errorStack });
      throw error;
    }
  }

  /**
   * Log a function call with arguments
   */
  logCall(category: string, functionName: string, args: Record<string, unknown> = {}): void {
    this.debug(category, `${functionName}()`, args);
  }

  /**
   * Log state changes
   */
  logStateChange(category: string, stateName: string, oldValue: unknown, newValue: unknown, context: Record<string, unknown> = {}): void {
    this.debug(category, `State change: ${stateName}`, {
      old: oldValue,
      new: newValue,
      ...context
    });
  }
}

// Create global logger instance
const logger = new Logger();

// Export logger and constants
export { logger, LOG_LEVELS, LOG_CATEGORIES };
export default logger;
