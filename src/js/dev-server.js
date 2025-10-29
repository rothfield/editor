#!/usr/bin/env node

/**
 * Development Server for Music Notation Editor POC
 * Provides hot reload functionality and serves static files
 */

import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { watch } from 'fs';
import { stat, readFile } from 'fs/promises';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || 'localhost';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Structured Logger
class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  log(levelName, message, meta = {}) {
    if (this.levels[levelName] > this.levels[this.level]) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: levelName,
      message,
      ...meta
    };

    const output = `[${timestamp}] ${levelName.toUpperCase()}: ${message}`;
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';

    if (levelName === 'error') {
      console.error(output + metaStr);
    } else if (levelName === 'warn') {
      console.warn(output + metaStr);
    } else {
      console.log(output + metaStr);
    }
  }

  error(message, meta) { this.log('error', message, meta); }
  warn(message, meta) { this.log('warn', message, meta); }
  info(message, meta) { this.log('info', message, meta); }
  debug(message, meta) { this.log('debug', message, meta); }
}

const logger = new Logger(LOG_LEVEL);

// MIME types for different file extensions
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif'
};

/**
 * Get MIME type for a file extension
 */
function getMimeType(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return MIME_TYPES[ext] || 'text/plain';
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serve a file with proper headers
 */
async function serveFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    const mimeType = getMimeType(filePath);

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    res.end(data);
  } catch (error) {
    logger.error('Failed to serve file', {
      path: filePath,
      error: error.message
    });
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

/**
 * Handle CORS preflight requests
 */
function handleCors(res) {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end();
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: NODE_ENV
    }));
    return true;
  }

  if (url.pathname === '/ready') {
    const ready = serverReady && webSocketClients.size >= 0;
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ready: ready,
      timestamp: new Date().toISOString(),
      wsClients: webSocketClients.size
    }));
    return true;
  }

  return false;
}

/**
 * Render LilyPond to SVG or PNG (local rendering - only used if lilypond is installed)
 * NOTE: WebUI now calls docker service directly at http://localhost:8787/engrave
 */
async function renderLilyPond(lilypondSource, outputFormat = 'svg') {
  const { spawn } = await import('child_process');
  const { execSync } = await import('child_process');
  const { writeFile, unlink } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const { randomUUID } = await import('crypto');

  const tempId = randomUUID();
  const tempBaseFile = join(tmpdir(), `lilypond-output-${tempId}`);
  const pngPath = tempBaseFile + '.png';

  return new Promise(async (resolve, reject) => {
    try {
      // Find lilypond in PATH
      let lilypondCmd = 'lilypond';
      try {
        lilypondCmd = execSync('which lilypond', { encoding: 'utf8' }).trim();
        logger.debug('Found lilypond at', { path: lilypondCmd });
      } catch (e) {
        logger.warn('lilypond not in PATH, will try default name');
      }

      // Spawn lilypond with stdin piping (no temp .ly files!)
      const lilypondProcess = spawn(lilypondCmd, [
        '--png',
        '-dno-gs-load-fonts',
        '-dinclude-eps-fonts',
        '-dresolution=300',
        '-dpoint-and-click=false',
        '-ddelete-intermediate-files',
        '-o',
        tempBaseFile,
        '-'  // Read from stdin instead of file
      ], {
        cwd: '/tmp',
        env: { ...process.env }
      });

      let errorOutput = '';
      let stdoutData = '';

      lilypondProcess.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
      });

      lilypondProcess.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });

      // Write LilyPond source to stdin
      lilypondProcess.stdin.write(lilypondSource);
      lilypondProcess.stdin.end();

      lilypondProcess.on('close', async (code) => {
        try {
          if (code !== 0) {
            const err = errorOutput || `lilypond exited with code ${code}`;
            logger.error('lilypond process failed', {
              code,
              error: err.substring(0, 500)
            });
            reject(new Error(`lilypond failed: ${err}`));
            return;
          }

          // Read the generated PNG file
          const { readFile } = await import('fs/promises');
          let pngBuffer;
          try {
            pngBuffer = await readFile(pngPath);
          } catch (e) {
            logger.warn('lilypond produced no PNG file', {
              expected: pngPath,
              error: e.message
            });
            reject(new Error(`lilypond produced no output: ${pngPath}`));
            return;
          }

          // Clean up PNG file
          try {
            await unlink(pngPath);
          } catch (e) {
            logger.debug('Failed to cleanup PNG file', { path: pngPath });
          }

          logger.debug('lilypond rendering successful', {
            pngSize: pngBuffer.length,
            format: outputFormat
          });

          if (outputFormat === 'png') {
            // Return PNG as base64
            const pngBase64 = pngBuffer.toString('base64');
            resolve({
              success: true,
              svg: null,
              png_base64: pngBase64,
              format: 'png',
              error: null
            });
          } else {
            // Convert PNG to SVG using ImageMagick (fallback to placeholder if not available)
            convertPngToSvg(pngBuffer)
              .then((svg) => {
                resolve({
                  success: true,
                  svg: svg,
                  png_base64: null,
                  format: 'svg',
                  error: null
                });
              })
              .catch((err) => {
                logger.warn('PNG to SVG conversion failed, returning PNG fallback', {
                  error: err.message
                });
                // If conversion fails, return base64 PNG instead
                resolve({
                  success: true,
                  svg: null,
                  png_base64: pngBuffer.toString('base64'),
                  png_fallback: true,
                  format: 'svg',
                  error: null
                });
              });
          }
        } catch (error) {
          logger.error('Error handling lilypond output', {
            error: error.message,
            stack: error.stack
          });
          reject(error);
        }
      });

      lilypondProcess.on('error', (error) => {
        logger.error('lilypond spawn error', {
          error: error.message,
          command: lilypondCmd
        });
        reject(error);
      });
    } catch (error) {
      logger.error('renderLilyPond error', {
        error: error.message,
        stack: error.stack
      });
      reject(error);
    }
  });
}

/**
 * Convert PNG buffer to SVG using ImageMagick
 */
async function convertPngToSvg(pngBuffer) {
  const { spawn, execSync } = await import('child_process');
  const { writeFile, unlink } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const tempFile = join(tmpdir(), `lilypond-${Date.now()}.png`);

  return new Promise(async (resolve, reject) => {
    try {
      // Write PNG to temp file
      await writeFile(tempFile, pngBuffer);

      // Find convert command in PATH
      let convertCmd = 'convert';
      try {
        convertCmd = execSync('which convert', { encoding: 'utf8' }).trim();
        logger.debug('Found convert at', { path: convertCmd });
      } catch (e) {
        logger.warn('convert not in PATH, will try default name');
      }

      const convertProcess = spawn(convertCmd, [tempFile, 'svg:-'], {
        env: { ...process.env }
      });

      let svgOutput = '';
      let errorOutput = '';

      convertProcess.stdout.on('data', (chunk) => {
        svgOutput += chunk.toString();
      });

      convertProcess.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });

      convertProcess.on('close', async (code) => {
        // Clean up temp file
        try {
          await unlink(tempFile);
        } catch (e) {
          logger.debug('Failed to cleanup temp file', { path: tempFile });
        }

        if (code !== 0) {
          const err = errorOutput || `convert exited with code ${code}`;
          logger.error('convert process failed', {
            code,
            error: err.substring(0, 300)
          });
          reject(new Error(`convert failed: ${err}`));
          return;
        }

        if (!svgOutput || svgOutput.length === 0) {
          logger.warn('convert produced no SVG output');
          reject(new Error('convert produced no output'));
          return;
        }

        logger.debug('PNG to SVG conversion successful', {
          svgSize: svgOutput.length
        });
        resolve(svgOutput);
      });

      convertProcess.on('error', async (error) => {
        logger.error('convert spawn error', {
          error: error.message,
          command: convertCmd
        });
        try {
          await unlink(tempFile);
        } catch (e) {
          // ignore cleanup errors
        }
        reject(error);
      });
    } catch (error) {
      logger.error('convertPngToSvg error', {
        error: error.message,
        stack: error.stack
      });
      reject(error);
    }
  });
}

/**
 * Inject hot reload script into HTML
 */
async function injectHotReload(htmlContent) {
  const hotReloadScript = `
    <script>
      (function() {
        let ws;
        let reconnectTimer;

        // Initialize hotreload enabled state (default to true)
        const HOTRELOAD_KEY = 'hotreloadEnabled';
        let localStorageAvailable = true;

        // Check if localStorage is available
        try {
          localStorage.setItem('__hotreload_test', '1');
          localStorage.removeItem('__hotreload_test');
        } catch (e) {
          localStorageAvailable = false;
          console.warn('localStorage not available (incognito mode or disabled), using in-memory state');
        }

        // In-memory fallback state
        let hotReloadState = true;

        try {
          if (localStorageAvailable && !localStorage.hasOwnProperty(HOTRELOAD_KEY)) {
            localStorage.setItem(HOTRELOAD_KEY, 'true');
          }
        } catch (e) {
          console.warn('Failed to initialize localStorage for hot reload:', e.message);
        }

        function isHotReloadEnabled() {
          if (localStorageAvailable) {
            try {
              return localStorage.getItem(HOTRELOAD_KEY) === 'true';
            } catch (e) {
              console.warn('Failed to read from localStorage:', e.message);
              return hotReloadState;
            }
          }
          return hotReloadState;
        }

        // Listen for storage changes (hotreload toggle from other tabs)
        window.addEventListener('storage', function(e) {
          if (e.key === HOTRELOAD_KEY) {
            const enabled = e.newValue === 'true';
            console.log('Hot reload ' + (enabled ? 'enabled' : 'disabled') + ' (from another tab)');
          }
        });

        function connectWebSocket() {
          ws = new WebSocket('ws://${HOST}:${PORT}/ws');

          ws.onopen = function() {
            console.log('Hot reload connected');
            if (reconnectTimer) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
          };

          ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'reload') {
              if (isHotReloadEnabled()) {
                console.log('Hot reload triggered');
                window.location.reload();
              } else {
                console.log('Hot reload skipped (disabled by user)');
              }
            }
          };

          ws.onclose = function() {
            console.log('Hot reload disconnected, attempting to reconnect...');
            if (isHotReloadEnabled()) {
              reconnectTimer = setTimeout(connectWebSocket, 2000);
            }
          };

          ws.onerror = function(error) {
            console.error('WebSocket error:', error);
          };
        }

        // Only connect if hot reload is enabled
        if (isHotReloadEnabled()) {
          connectWebSocket();
        } else {
          console.log('Hot reload is disabled');
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', function() {
          if (ws) {
            ws.close();
          }
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
          }
        });

        // Expose toggle function for UI control
        window.toggleHotReload = function() {
          try {
            let enabled;
            if (localStorageAvailable) {
              try {
                enabled = localStorage.getItem(HOTRELOAD_KEY) === 'true';
              } catch (e) {
                enabled = hotReloadState;
              }
            } else {
              enabled = hotReloadState;
            }

            const newEnabled = !enabled;

            // Update localStorage if available
            if (localStorageAvailable) {
              try {
                localStorage.setItem(HOTRELOAD_KEY, newEnabled ? 'true' : 'false');
              } catch (e) {
                console.warn('Failed to write to localStorage:', e.message);
              }
            }

            // Update in-memory state
            hotReloadState = newEnabled;

            console.log('Hot reload ' + (newEnabled ? 'enabled' : 'disabled'));

            if (newEnabled && !ws) {
              connectWebSocket();
            } else if (!newEnabled && ws) {
              ws.close();
              ws = null;
            }

            return newEnabled;
          } catch (error) {
            console.error('Error toggling hot reload:', error);
            return hotReloadState;
          }
        };

        // Expose status getter
        window.isHotReloadEnabled = isHotReloadEnabled;
      })();
    </script>
  `;

  // Insert script BEFORE main.js module script to ensure it executes first
  // This ensures window.toggleHotReload and window.isHotReloadEnabled are defined
  // before any module scripts try to use them
  const mainScriptTag = '<script type="module" src="dist/main.js"></script>';
  if (htmlContent.includes(mainScriptTag)) {
    return htmlContent.replace(mainScriptTag, `${hotReloadScript}\n    ${mainScriptTag}`);
  }

  // Fallback: inject at end of body if main.js script not found
  return htmlContent.replace('</body>', `${hotReloadScript}</body>`);
}

/**
 * Handle HTTP requests
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = join(projectRoot, url.pathname);

  // Handle health check endpoints
  if (handleHealthCheck(req, res)) {
    return;
  }

  // Handle root path
  if (url.pathname === '/') {
    filePath = join(projectRoot, 'index.html');
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    handleCors(res);
    return;
  }

  // Handle 404
  if (!(await fileExists(filePath))) {
    // Try to serve index.html for SPA routing
    if (!url.pathname.includes('.')) {
      filePath = join(projectRoot, 'index.html');
    } else {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
  }

  // Serve the file
  if (filePath.endsWith('.html')) {
    // Inject hot reload into HTML files
    try {
      const html = await readFile(filePath, 'utf8');
      const htmlWithReload = await injectHotReload(html);

      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(htmlWithReload);
    } catch (error) {
      logger.error('Failed to process HTML file', {
        path: filePath,
        error: error.message
      });
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  } else {
    await serveFile(res, filePath);
  }
}

/**
 * WebSocket connections for hot reload
 */
const webSocketClients = new Set();

// Create a single WebSocketServer instance
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  webSocketClients.add(ws);

  ws.on('close', () => {
    webSocketClients.delete(ws);
  });

  ws.send(JSON.stringify({ type: 'connected' }));
});

function handleWebSocketUpgrade(req, socket, head) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
}

/**
 * Notify all clients to reload
 */
function notifyReload() {
  const message = JSON.stringify({ type: 'reload' });

  webSocketClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

/**
 * File watching for hot reload
 */
function setupFileWatcher() {
  const watchPaths = [
    join(projectRoot, 'src'),
    join(projectRoot, 'dist'),
    join(projectRoot, 'index.html')
  ];

  watchPaths.forEach((watchPath) => {
    try {
      watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (filename && !filename.includes('node_modules') && !filename.includes('.git')) {
          logger.debug('File changed, triggering hot reload', {
            file: filename
          });
          notifyReload();
        }
      });
    } catch (error) {
      logger.error('Error watching files', {
        path: watchPath,
        error: error.message
      });
    }
  });
}

/**
 * Server ready flag for readiness checks
 */
let serverReady = false;
let isShuttingDown = false;

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('Graceful shutdown initiated', { signal });

  serverReady = false;

  // Give existing requests 30 seconds to finish
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    // Close all WebSocket connections gracefully
    logger.debug('Closing WebSocket connections', {
      count: webSocketClients.size
    });

    webSocketClients.forEach((ws) => {
      ws.close(1000, 'Server shutting down');
    });

    logger.info('Graceful shutdown complete');
    clearTimeout(shutdownTimeout);

    // Print final summary
    console.log('');
    console.log('==========================================');
    console.log('Development Environment Stopped');
    console.log('==========================================');
    console.log('Session complete. To restart, run: make serve');
    console.log('==========================================');
    console.log('');

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: error.message
    });

    // Print final summary even on error
    console.log('');
    console.log('==========================================');
    console.log('Development Environment Stopped (Error)');
    console.log('==========================================');
    console.log('Session ended with error. Check logs above.');
    console.log('==========================================');
    console.log('');

    process.exit(1);
  }
}

/**
 * Create and start the development server
 */
async function startServer() {
  const server = createServer(handleRequest);

  // Handle WebSocket upgrade requests
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/ws') {
      handleWebSocketUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.listen(PORT, HOST, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    serverReady = true;

    logger.info('Server started successfully', {
      host: HOST,
      port: PORT,
      environment: NODE_ENV,
      url: `http://${HOST}:${PORT}`
    });

    logger.info('Features enabled', {
      hotReload: true,
      health: true,
      ready: true,
      note: 'LilyPond rendering now uses Docker service at http://localhost:8787/engrave'
    });

    logger.info('Available endpoints', {
      health: 'GET /health',
      ready: 'GET /ready',
      websocket: 'WS /ws',
      note: 'LilyPond rendering: Call http://localhost:8787/engrave directly'
    });

    // Print startup summary
    console.log('');
    console.log('==========================================');
    console.log('Development Environment Summary');
    console.log('==========================================');
    console.log('✓ LilyPond Service:     http://localhost:8787');
    console.log('✓ Development Server:   http://localhost:3000');
    console.log('✓ Hot Reload:           Enabled');
    console.log('');
    console.log('Commands:');
    console.log('  make kill   - Stop all servers');
    console.log('  make test   - Run tests');
    console.log('==========================================');
    console.log('');

    // Setup file watching for hot reload
    setupFileWatcher();

    // Handle graceful shutdown signals
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
      });
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', {
        reason: String(reason),
        promise: String(promise)
      });
    });
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Check if required dependencies are available
async function checkDependencies() {
  try {
    await import('ws');
    logger.debug('All required dependencies available');
  } catch (error) {
    logger.error('Missing required dependency', {
      package: 'ws',
      error: error.message,
      suggestion: 'npm install ws'
    });
    process.exit(1);
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info('Development server starting', {
    version: '1.0.0',
    nodeVersion: process.version,
    environment: NODE_ENV
  });

  checkDependencies().then(startServer).catch((error) => {
    logger.error('Fatal error', { error: error.message });
    process.exit(1);
  });
}

export { startServer, handleRequest, notifyReload };
