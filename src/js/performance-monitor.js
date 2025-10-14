/**
 * Performance Monitor
 *
 * Tracks and analyzes performance metrics for the Music Notation Editor.
 * Monitors typing latency, render time, beat derivation, and other operations.
 */

import {
  MAX_PERFORMANCE_SAMPLES,
  PERFORMANCE_THRESHOLDS,
  METRICS_UPDATE_INTERVAL_MS
} from './constants.js';
import logger, { LOG_CATEGORIES } from './logger.js';

/**
 * Performance metrics tracker
 */
class PerformanceMonitor {
  constructor() {
    /**
     * Metric categories and their samples
     */
    this.metrics = {
      typingLatency: [],
      beatDerivation: [],
      renderTime: [],
      focusActivation: [],
      navigationLatency: [],
      selectionLatency: [],
      commandLatency: []
    };

    /**
     * Timing markers for ongoing operations
     */
    this.timers = new Map();

    /**
     * Statistics cache
     */
    this.statsCache = new Map();

    /**
     * Update interval handle
     */
    this.updateInterval = null;

    /**
     * Indicator element for UI updates
     */
    this.indicatorElement = null;
  }

  /**
   * Start performance monitoring
   */
  start() {
    logger.info(LOG_CATEGORIES.PERFORMANCE, 'Starting performance monitoring');

    // Clear any existing interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.updateStatistics();
    }, METRICS_UPDATE_INTERVAL_MS);

    // Find indicator element
    this.indicatorElement = document.getElementById('performance-indicator');
  }

  /**
   * Stop performance monitoring
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    logger.info(LOG_CATEGORIES.PERFORMANCE, 'Performance monitoring stopped');
  }

  /**
   * Start timing an operation
   *
   * @param {string} label - Operation label
   */
  startTimer(label) {
    this.timers.set(label, performance.now());
    logger.trace(LOG_CATEGORIES.PERFORMANCE, `Timer started: ${label}`);
  }

  /**
   * End timing an operation and record the metric
   *
   * @param {string} label - Operation label
   * @param {string} category - Metric category
   * @returns {number|null} Duration in milliseconds
   */
  endTimer(label, category = 'commandLatency') {
    const startTime = this.timers.get(label);

    if (startTime === undefined) {
      logger.warn(LOG_CATEGORIES.PERFORMANCE, `Timer not found: ${label}`);
      return null;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(label);

    // Record the metric
    this.recordMetric(category, duration);

    logger.trace(LOG_CATEGORIES.PERFORMANCE, `Timer ended: ${label}`, {
      duration: `${duration.toFixed(2)}ms`
    });

    return duration;
  }

  /**
   * Record a performance metric
   *
   * @param {string} category - Metric category
   * @param {number} value - Metric value in milliseconds
   */
  recordMetric(category, value) {
    if (!this.metrics[category]) {
      logger.warn(LOG_CATEGORIES.PERFORMANCE, `Unknown metric category: ${category}`);
      return;
    }

    // Add sample
    this.metrics[category].push({
      value,
      timestamp: performance.now()
    });

    // Trim to max samples
    if (this.metrics[category].length > MAX_PERFORMANCE_SAMPLES) {
      this.metrics[category].shift();
    }

    // Check for performance warnings
    this.checkPerformanceThresholds(category, value);

    // Invalidate stats cache for this category
    this.statsCache.delete(category);

    logger.debug(LOG_CATEGORIES.PERFORMANCE, `Recorded ${category}`, {
      value: `${value.toFixed(2)}ms`,
      sampleCount: this.metrics[category].length
    });
  }

  /**
   * Check if a metric exceeds performance thresholds
   *
   * @private
   * @param {string} category - Metric category
   * @param {number} value - Metric value
   */
  checkPerformanceThresholds(category, value) {
    const thresholds = {
      typingLatency: PERFORMANCE_THRESHOLDS.TYPING_LATENCY_WARNING_MS,
      renderTime: PERFORMANCE_THRESHOLDS.RENDER_WARNING_MS,
      beatDerivation: PERFORMANCE_THRESHOLDS.BEAT_DERIVATION_WARNING_MS
    };

    const threshold = thresholds[category];
    if (threshold && value > threshold) {
      logger.warn(LOG_CATEGORIES.PERFORMANCE, `Performance warning: ${category}`, {
        value: `${value.toFixed(2)}ms`,
        threshold: `${threshold}ms`
      });
    }
  }

  /**
   * Get statistics for a metric category
   *
   * @param {string} category - Metric category
   * @returns {Object} Statistics object
   */
  getStatistics(category) {
    // Check cache first
    if (this.statsCache.has(category)) {
      return this.statsCache.get(category);
    }

    const samples = this.metrics[category];
    if (!samples || samples.length === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0
      };
    }

    // Extract values
    const values = samples.map(s => s.value);

    // Calculate statistics
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const stats = {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      mean,
      median: this.getPercentile(sorted, 50),
      p95: this.getPercentile(sorted, 95),
      p99: this.getPercentile(sorted, 99)
    };

    // Cache the result
    this.statsCache.set(category, stats);

    return stats;
  }

  /**
   * Get percentile value from sorted array
   *
   * @private
   * @param {Array<number>} sorted - Sorted array of values
   * @param {number} percentile - Percentile (0-100)
   * @returns {number} Percentile value
   */
  getPercentile(sorted, percentile) {
    if (sorted.length === 0) return 0;

    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  /**
   * Get statistics for all metric categories
   *
   * @returns {Object} All statistics
   */
  getAllStatistics() {
    const allStats = {};

    for (const category of Object.keys(this.metrics)) {
      allStats[category] = this.getStatistics(category);
    }

    return allStats;
  }

  /**
   * Update statistics cache
   *
   * @private
   */
  updateStatistics() {
    // Clear cache to force recalculation
    this.statsCache.clear();

    // Log current performance state
    const stats = this.getAllStatistics();

    logger.debug(LOG_CATEGORIES.PERFORMANCE, 'Performance statistics updated', {
      typingLatency: `${stats.typingLatency.mean.toFixed(2)}ms`,
      renderTime: `${stats.renderTime.mean.toFixed(2)}ms`,
      beatDerivation: `${stats.beatDerivation.mean.toFixed(2)}ms`
    });
  }

  /**
   * Update performance indicator in UI
   *
   * @param {string} state - Indicator state ('ready', 'working', 'warning', 'error')
   * @param {string} [message] - Optional message to display
   */
  updateIndicator(state, message = '') {
    if (!this.indicatorElement) {
      this.indicatorElement = document.getElementById('performance-indicator');
    }

    if (!this.indicatorElement) {
      return;
    }

    // Update state
    this.indicatorElement.dataset.state = state;

    // Update colors based on state
    const stateColors = {
      ready: 'text-success',
      working: 'text-warning',
      warning: 'text-warning',
      error: 'text-error'
    };

    // Remove all state classes
    Object.values(stateColors).forEach(className => {
      this.indicatorElement.classList.remove(className);
    });

    // Add current state class
    if (stateColors[state]) {
      this.indicatorElement.classList.add(stateColors[state]);
    }

    // Update message if provided
    if (message) {
      this.indicatorElement.textContent = message;
    }
  }

  /**
   * Get performance report as formatted string
   *
   * @returns {string} Performance report
   */
  getReport() {
    const stats = this.getAllStatistics();
    const lines = ['Performance Report', '==================', ''];

    for (const [category, data] of Object.entries(stats)) {
      if (data.count > 0) {
        lines.push(`${category}:`);
        lines.push(`  Count: ${data.count}`);
        lines.push(`  Mean: ${data.mean.toFixed(2)}ms`);
        lines.push(`  Median: ${data.median.toFixed(2)}ms`);
        lines.push(`  Min: ${data.min.toFixed(2)}ms`);
        lines.push(`  Max: ${data.max.toFixed(2)}ms`);
        lines.push(`  P95: ${data.p95.toFixed(2)}ms`);
        lines.push(`  P99: ${data.p99.toFixed(2)}ms`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Export metrics data as JSON
   *
   * @returns {Object} Metrics data
   */
  exportData() {
    return {
      metrics: this.metrics,
      statistics: this.getAllStatistics(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear all metrics
   */
  clear() {
    for (const category of Object.keys(this.metrics)) {
      this.metrics[category] = [];
    }

    this.statsCache.clear();
    this.timers.clear();

    logger.info(LOG_CATEGORIES.PERFORMANCE, 'Performance metrics cleared');
  }

  /**
   * Get current memory usage (if available)
   *
   * @returns {Object|null} Memory usage object or null
   */
  getMemoryUsage() {
    if (!performance.memory) {
      return null;
    }

    return {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      usedMB: (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2),
      totalMB: (performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)
    };
  }
}

// Export singleton instance
const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;
export { PerformanceMonitor };
