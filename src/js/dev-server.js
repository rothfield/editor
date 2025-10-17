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
 * Handle LilyPond rendering requests
 * Pipes LilyPond source directly to stdin, no temp files needed
 */
async function handleLilyPondRender(req, res) {
  let body = '';

  req.on('data', (chunk) => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const { lilypond_source, template_variant, output_format } = payload;

      if (!lilypond_source || lilypond_source.trim().length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: false,
            error: 'LilyPond source is empty',
            svg: null,
            png_base64: null,
            format: output_format || 'svg'
          })
        );
        return;
      }

      // Check if lilypond_source is already templated (from WASM converter)
      // If it starts with \version, it's already a complete LilyPond document
      const isAlreadyTemplated = lilypond_source.trim().startsWith('\\version');

      // Generate LilyPond with template only if not already templated
      const lilypondFull = isAlreadyTemplated
        ? lilypond_source
        : generateLilyPondTemplate(lilypond_source, template_variant);

      logger.debug('LilyPond source', {
        length: lilypondFull.length,
        isAlreadyTemplated,
        firstLine: lilypondFull.split('\n')[0]
      });

      // Try to render - return error details to client
      let result;
      try {
        result = await renderLilyPond(lilypondFull, output_format);
      } catch (err) {
        logger.error('LilyPond rendering error', {
          error: err.message
        });
        // Return error details to client
        result = {
          success: false,
          svg: null,
          png_base64: null,
          format: output_format || 'svg',
          error: err.message
        };
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(result));
    } catch (error) {
      logger.error('LilyPond rendering failed', {
        error: error.message,
        stack: error.stack
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: error.message,
          svg: null,
          png_base64: null,
          format: 'svg'
        })
      );
    }
  });
}

/**
 * Generate LilyPond source with template wrapping
 */
function generateLilyPondTemplate(source, variant = 'minimal') {
  if (variant === 'minimal') {
    return '\\version "2.24.0"\n' +
           '\\score {\n' +
           '  {\n' +
           '    ' + source + '\n' +
           '  }\n' +
           '  \\layout { }\n' +
           '  \\midi { }\n' +
           '}';
  } else {
    return '\\version "2.24.0"\n' +
           '\\language "english"\n' +
           '\\score {\n' +
           '  \\new Staff {\n' +
           '    \\relative c\' {\n' +
           '      ' + source + '\n' +
           '    }\n' +
           '  }\n' +
           '  \\layout { indent = #0 }\n' +
           '  \\midi { }\n' +
           '}';
  }
}

/**
 * Generate placeholder SVG when lilypond is not available
 */
function generatePlaceholderSvg(source) {
  const lines = source.split('\\n').slice(0, 3).join(', ');
  const preview = lines.length > 50 ? lines.substring(0, 50) + '...' : lines;

  return `
<svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: monospace; font-size: 14px; }
    .title { font-size: 18px; font-weight: bold; fill: #0066cc; }
    .subtitle { font-size: 12px; fill: #666; }
    .note { fill: #333; }
  </style>

  <rect width="800" height="200" fill="#f9fafb" stroke="#ddd" stroke-width="1"/>

  <text x="20" y="40" class="title">LilyPond Preview</text>
  <text x="20" y="65" class="subtitle">Source:</text>
  <text x="20" y="85" class="note">${escapeHtml(preview)}</text>

  <text x="20" y="130" class="subtitle">Note: LilyPond is not installed on this system.</text>
  <text x="20" y="150" class="subtitle">To enable rendering, install lilypond:</text>
  <text x="20" y="170" class="note">  brew install lilypond  (macOS)</text>
</svg>
  `.trim();
}

/**
 * Escape HTML entities
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Render LilyPond to SVG or PNG
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
              console.log('Hot reload triggered');
              window.location.reload();
            }
          };

          ws.onclose = function() {
            console.log('Hot reload disconnected, attempting to reconnect...');
            reconnectTimer = setTimeout(connectWebSocket, 2000);
          };

          ws.onerror = function(error) {
            console.error('WebSocket error:', error);
          };
        }

        // Connect WebSocket when page loads
        connectWebSocket();

        // Cleanup on page unload
        window.addEventListener('beforeunload', function() {
          if (ws) {
            ws.close();
          }
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
          }
        });
      })();
    </script>
  `;

  // Insert script before closing body tag
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

  // Handle LilyPond API endpoint
  if (req.method === 'POST' && url.pathname === '/api/lilypond/render') {
    await handleLilyPondRender(req, res);
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
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: error.message
    });
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
      lilypondApi: true,
      health: true,
      ready: true
    });

    logger.info('Available endpoints', {
      health: 'GET /health',
      ready: 'GET /ready',
      lilypond: 'POST /api/lilypond/render',
      websocket: 'WS /ws'
    });

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
