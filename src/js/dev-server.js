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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end();
}

/**
 * Handle LilyPond rendering requests
 * Invokes lilypond command with stdin piping to avoid disk writes
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

      // Generate LilyPond with template
      const lilypondFull = generateLilyPondTemplate(lilypond_source, template_variant);

      // Try to render - if lilypond not found, return demo SVG
      let result;
      try {
        result = await renderLilyPond(lilypondFull, output_format);
      } catch (err) {
        console.warn('[LilyPond] lilypond command not available, returning placeholder:', err.message);
        // Return a placeholder SVG for demo purposes
        result = {
          success: true,
          svg: generatePlaceholderSvg(lilypond_source),
          png_base64: null,
          format: 'svg',
          error: null
        };
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[LilyPond] Error:', error);
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
  const baseTemplate = {
    minimal: () => `\\version "2.24.0"
\\score {
  {
    ${source}
  }
  \\layout { }
  \\midi { }
}`,
    full: () => `\\version "2.24.0"
\\language "english"
\\score {
  \\new Staff {
    \\relative c' {
      ${source}
    }
  }
  \\layout { indent = #0 }
  \\midi { }
}`
  };

  return (baseTemplate[variant] || baseTemplate.minimal)();
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
  const { promisify } = await import('util');

  return new Promise((resolve, reject) => {
    try {
      // Check if lilypond is available
      const lilypondProcess = spawn('lilypond', [
        '--png',
        '-dno-gs-load-fonts',
        '-dinclude-eps-fonts',
        '-dresolution=150',
        '-o',
        '/dev/stdout',
        '-'
      ]);

      let pngBuffer = Buffer.alloc(0);
      let errorOutput = '';

      lilypondProcess.stdout.on('data', (chunk) => {
        pngBuffer = Buffer.concat([pngBuffer, chunk]);
      });

      lilypondProcess.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString();
      });

      lilypondProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`lilypond failed: ${errorOutput || 'unknown error'}`));
          return;
        }

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
            .catch(() => {
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
      });

      lilypondProcess.on('error', (error) => {
        reject(error);
      });

      lilypondProcess.stdin.write(lilypondSource);
      lilypondProcess.stdin.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Convert PNG buffer to SVG using ImageMagick
 */
async function convertPngToSvg(pngBuffer) {
  const { spawn } = await import('child_process');
  const { writeFile, unlink } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const tempFile = join(tmpdir(), `lilypond-${Date.now()}.png`);

  return new Promise(async (resolve, reject) => {
    try {
      // Write PNG to temp file
      await writeFile(tempFile, pngBuffer);

      const convertProcess = spawn('convert', [tempFile, 'svg:-']);

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
          // ignore cleanup errors
        }

        if (code !== 0) {
          reject(new Error(`convert failed: ${errorOutput}`));
          return;
        }

        resolve(svgOutput);
      });

      convertProcess.on('error', async (error) => {
        try {
          await unlink(tempFile);
        } catch (e) {
          // ignore cleanup errors
        }
        reject(error);
      });
    } catch (error) {
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

  const options = {
    recursive: true
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
