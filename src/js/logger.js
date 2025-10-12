/**
 * Logging utility for the Music Notation Editor
 *
 * Provides structured logging with categories, timing, and context
 */

const LOG_LEVELS = {
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
    PERFORMANCE: 'Performance'
};

class Logger {
    constructor() {
        this.level = LOG_LEVELS.INFO; // Default level
        this.enabledCategories = new Set(Object.values(LOG_CATEGORIES));
        this.timers = new Map();
    }

    /**
     * Set the logging level
     */
    setLevel(level) {
        if (typeof level === 'string') {
            this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
        } else {
            this.level = level;
        }
    }

    /**
     * Enable/disable specific categories
     */
    enableCategory(category) {
        this.enabledCategories.add(category);
    }

    disableCategory(category) {
        this.enabledCategories.delete(category);
    }

    /**
     * Check if a level is enabled
     */
    shouldLog(level, category) {
        return level <= this.level && this.enabledCategories.has(category);
    }

    /**
     * Format a log message
     */
    format(category, level, message, context = {}) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
        const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level);

        let formatted = `[${timestamp}] [${category}] ${message}`;

        if (Object.keys(context).length > 0) {
            formatted += ` ${JSON.stringify(context)}`;
        }

        return formatted;
    }

    /**
     * Log an error
     */
    error(category, message, context = {}) {
        if (this.shouldLog(LOG_LEVELS.ERROR, category)) {
            const formatted = this.format(category, LOG_LEVELS.ERROR, message, context);
            console.error(`🔴 ${formatted}`);
        }
    }

    /**
     * Log a warning
     */
    warn(category, message, context = {}) {
        if (this.shouldLog(LOG_LEVELS.WARN, category)) {
            const formatted = this.format(category, LOG_LEVELS.WARN, message, context);
            console.warn(`⚠️  ${formatted}`);
        }
    }

    /**
     * Log an info message
     */
    info(category, message, context = {}) {
        if (this.shouldLog(LOG_LEVELS.INFO, category)) {
            const formatted = this.format(category, LOG_LEVELS.INFO, message, context);
            console.info(`ℹ️  ${formatted}`);
        }
    }

    /**
     * Log a debug message
     */
    debug(category, message, context = {}) {
        if (this.shouldLog(LOG_LEVELS.DEBUG, category)) {
            const formatted = this.format(category, LOG_LEVELS.DEBUG, message, context);
            console.log(`🐛 ${formatted}`);
        }
    }

    /**
     * Log a trace message
     */
    trace(category, message, context = {}) {
        if (this.shouldLog(LOG_LEVELS.TRACE, category)) {
            const formatted = this.format(category, LOG_LEVELS.TRACE, message, context);
            console.log(`🔍 ${formatted}`);
        }
    }

    /**
     * Start a timer for performance measurement
     */
    time(label, category = LOG_CATEGORIES.PERFORMANCE) {
        const id = `${category}:${label}`;
        this.timers.set(id, performance.now());
        this.trace(category, `Timer started: ${label}`);
    }

    /**
     * End a timer and log the duration
     */
    timeEnd(label, category = LOG_CATEGORIES.PERFORMANCE, context = {}) {
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
    async logOperation(category, operation, fn, context = {}) {
        this.time(operation, category);
        try {
            const result = await fn();
            this.timeEnd(operation, category, { ...context, status: 'success' });
            return result;
        } catch (error) {
            this.timeEnd(operation, category, { ...context, status: 'error', error: error.message });
            this.error(category, `${operation} failed`, { error: error.message, stack: error.stack });
            throw error;
        }
    }

    /**
     * Log a function call with arguments
     */
    logCall(category, functionName, args = {}) {
        this.debug(category, `${functionName}()`, args);
    }

    /**
     * Log state changes
     */
    logStateChange(category, stateName, oldValue, newValue, context = {}) {
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
