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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || 'localhost';

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
  '.gif': 'image/gif',
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });

    res.end(data);
  } catch (error) {
    console.error(`Error serving file ${filePath}:`, error);
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end();
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
  return htmlContent.replace('</body>', hotReloadScript + '</body>');
}

/**
 * Handle HTTP requests
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = join(projectRoot, url.pathname);

  // Handle root path
  if (url.pathname === '/') {
    filePath = join(projectRoot, 'index.html');
  }

  // Handle WebSocket upgrade
  if (url.pathname === '/ws' && req.headers.upgrade === 'websocket') {
    handleWebSocketUpgrade(req, res);
    return;
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
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(htmlWithReload);
    } catch (error) {
      console.error(`Error processing HTML file ${filePath}:`, error);
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

function handleWebSocketUpgrade(req, socket, head) {
  const { WebSocketServer } = require('ws');

  const wss = new WebSocketServer({ noServer: true });

  wss.handleUpgrade(req, socket, head, (ws) => {
    webSocketClients.add(ws);

    ws.on('close', () => {
      webSocketClients.delete(ws);
    });

    ws.send(JSON.stringify({ type: 'connected' }));
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
    join(projectRoot, 'index.html'),
  ];

  const options = {
    recursive: true,
  };

  watchPaths.forEach((watchPath) => {
    try {
      watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (filename && !filename.includes('node_modules') && !filename.includes('.git')) {
          console.log(`File changed: ${filename}`);
          notifyReload();
        }
      });
    } catch (error) {
      console.error(`Error watching ${watchPath}:`, error);
    }
  });
}

/**
 * Create and start the development server
 */
async function startServer() {
  const server = createServer(handleRequest);

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

    console.log(`🎵 Music Notation Editor Development Server`);
    console.log(`📍 Server running at: http://${HOST}:${PORT}`);
    console.log(`🔥 Hot reload enabled`);
    console.log(`⚠️  Press Ctrl+C to stop the server`);

    // Setup file watching for hot reload
    setupFileWatcher();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down development server...');

      // Close WebSocket connections
      webSocketClients.forEach((ws) => {
        ws.close();
      });

      // Close HTTP server
      server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Check if required dependencies are available
async function checkDependencies() {
  try {
    await import('ws');
  } catch (error) {
    console.error('❌ Missing required dependency: ws');
    console.error('Please install it with: npm install ws');
    process.exit(1);
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  checkDependencies().then(startServer);
}

export { startServer, handleRequest, notifyReload };