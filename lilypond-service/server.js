#!/usr/bin/env node

/**
 * LilyPond Rendering Service
 *
 * A secure, containerized service that converts LilyPond source code to SVG/PDF.
 *
 * Security features:
 * - Input validation & sanitization
 * - Blocks dangerous directives (\include, #(scheme), external URLs)
 * - Process timeout protection (15s default)
 * - Request size limits (512KB default)
 * - SHA-256 response caching
 * - Non-root execution in container
 * - Read-only root FS with tmpfs /tmp
 */

const express = require('express');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const PORT = process.env.PORT || 8787;
const MAX_REQUEST_SIZE = parseInt(process.env.MAX_REQUEST_SIZE || '512', 10) * 1024; // 512 KB default
const RENDER_TIMEOUT = parseInt(process.env.RENDER_TIMEOUT || '15', 10) * 1000; // 15 seconds
const CACHE_DIR = '/tmp/lilypond-cache';
const TMP_DIR = '/tmp/lilypond-work';
const FONTCONFIG_CACHE_DIR = '/tmp/.fontconfig';

// Configure fontconfig for non-root user with tmpfs
process.env.XDG_CACHE_HOME = FONTCONFIG_CACHE_DIR;
process.env.FONTCONFIG_PATH = '/etc/fonts';

// Initialize directories
for (const dir of [CACHE_DIR, TMP_DIR, FONTCONFIG_CACHE_DIR]) {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o1777 });
    } catch (err) {
      console.warn(`[WARNING] Failed to create ${dir}: ${err.message}`);
    }
  }
}

// Express app
const app = express();

// Middleware: request size limit
app.use(express.json({ limit: `${Math.floor(MAX_REQUEST_SIZE / 1024)}kb` }));

// Middleware: CORS headers for cross-origin requests from webui
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '3600');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Middleware: request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * Input validation: block dangerous LilyPond directives
 */
function validateLilyPondSource(ly) {
  const errors = [];

  // Block \include (file inclusion)
  if (/\\include\s*["']/.test(ly)) {
    errors.push('\\include directive is not allowed');
  }

  // Block external file references
  if (/\\include\s+[<"]/.test(ly)) {
    errors.push('External file inclusion is not allowed');
  }

  // Block Scheme expressions (#(...))
  if (/#\s*\([^)]*\)/.test(ly)) {
    errors.push('Scheme expressions (#(...)) are not allowed');
  }

  // Block dangerous #set directives
  if (/#\s*'/.test(ly) || /#\s*\(define/.test(ly)) {
    errors.push('Advanced Scheme directives are not allowed');
  }

  // Block external URLs in markup
  if (/http:\/\/|https:\/\/|ftp:\/\//.test(ly)) {
    errors.push('External URLs are not allowed');
  }

  // Block system calls
  if (/system\s*\(|shell-escape|os\s*\.system/.test(ly)) {
    errors.push('System calls are not allowed');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Escape shell arguments to prevent injection
 */
function escapeShellArg(arg) {
  // Replace single quotes and escape them
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Generate cache key from LilyPond source
 */
function getCacheKey(ly, format) {
  const hash = crypto
    .createHash('sha256')
    .update(ly + format)
    .digest('hex');
  return path.join(CACHE_DIR, `${hash}.${format}`);
}

/**
 * Render LilyPond to SVG or PDF
 */
async function renderLilyPond(ly, format = 'svg') {
  return new Promise((resolve, reject) => {
    // Validate input
    const validation = validateLilyPondSource(ly);
    if (!validation.valid) {
      return reject({
        status: 400,
        message: 'Invalid LilyPond source',
        errors: validation.errors,
      });
    }

    // Check cache
    const cacheKey = getCacheKey(ly, format);
    if (fs.existsSync(cacheKey)) {
      console.log(`[CACHE HIT] ${cacheKey}`);
      try {
        const cached = fs.readFileSync(cacheKey);
        // Wrap cached result in new format
        if (format === 'svg') {
          return resolve({ pages: [cached], multiPage: true });
        } else {
          return resolve({ pages: [cached], multiPage: false });
        }
      } catch (err) {
        console.error(`[CACHE READ ERROR] ${err.message}`);
        // Fall through to render
      }
    }

    // Generate temp files
    const tempId = crypto.randomBytes(8).toString('hex');
    const lyFile = path.join(TMP_DIR, `${tempId}.ly`);
    const outputBase = path.join(TMP_DIR, tempId);

    try {
      // Write LilyPond source to temp file
      fs.writeFileSync(lyFile, ly, 'utf-8');

      // Build lilypond command with security flags
      const cmd = format === 'pdf'
        ? [
            'lilypond',
            '--pdf',
            '-dno-point-and-click',
            '-ddelete-intermediate-files',
            '-djob-count=2',
            `--output=${outputBase}`,
            lyFile,
          ]
        : [
            'lilypond',
            '-dbackend=svg',                // Explicit SVG backend
            '-dno-point-and-click',         // Disable clickable points
            '-ddelete-intermediate-files',  // Clean up intermediate files
            '-djob-count=2',                // Parallel processing for multi-page
            `--output=${outputBase}`,
            lyFile,
          ];

      console.log(`[RENDER] format=${format}, size=${ly.length} bytes`);

      // Execute lilypond with timeout and environment variables
      const child = spawn(cmd[0], cmd.slice(1), {
        timeout: RENDER_TIMEOUT,
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: TMP_DIR,
        env: {
          ...process.env,
          XDG_CACHE_HOME: FONTCONFIG_CACHE_DIR,
          FONTCONFIG_PATH: '/etc/fonts',
        }
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data;
      });

      child.stderr.on('data', (data) => {
        stderr += data;
      });

      child.on('error', (err) => {
        console.error(`[RENDER ERROR] ${err.message}`);
        reject({
          status: 500,
          message: 'Rendering process failed',
          error: err.message,
        });
      });

      child.on('close', (code) => {
        try {
          if (code !== 0) {
            console.error(`[LILYPOND ERROR] code=${code}`);
            console.error(`stderr: ${stderr}`);
            return reject({
              status: 400,
              message: 'LilyPond compilation failed',
              stderr,
            });
          }

          // For SVG: collect all pages (output.svg or output-page1.svg, output-page2.svg, etc.)
          // For PDF: single file (output.pdf)
          if (format === 'svg') {
            // Find all SVG files generated by LilyPond
            const files = fs.readdirSync(TMP_DIR);

            // LilyPond generates either:
            // - tempId.svg (single page, rare)
            // - tempId-1.svg, tempId-2.svg, ... (multi-page, common)
            // Match files like: tempId-1.svg, tempId-2.svg, etc.
            let pageFiles = files
              .filter(f => {
                if (!f.endsWith('.svg')) return false;
                // Match pattern: tempId-N.svg where N is a number
                const pattern = new RegExp(`^${tempId}-\\d+\\.svg$`);
                return pattern.test(f);
              })
              .sort(); // Sort to ensure correct page order

            // If no numbered page files, check for single file
            if (pageFiles.length === 0) {
              const singleFile = `${tempId}.svg`;
              if (files.includes(singleFile)) {
                pageFiles = [singleFile];
              }
            }

            if (pageFiles.length === 0) {
              console.error('[RENDER ERROR] No SVG files found. Available files:', files.filter(f => f.startsWith(tempId)));
              return reject({
                status: 500,
                message: 'No SVG output files found',
              });
            }

            console.log(`[RENDER] Found ${pageFiles.length} SVG page(s)`);

            // Read all pages
            const pages = pageFiles.map(file => {
              const fullPath = path.join(TMP_DIR, file);
              return fs.readFileSync(fullPath);
            });

            // Cache the first page for backwards compatibility
            try {
              fs.writeFileSync(cacheKey, pages[0]);
              console.log(`[CACHED] ${cacheKey}`);
            } catch (err) {
              console.error(`[CACHE WRITE ERROR] ${err.message}`);
            }

            // Cleanup temp files
            try {
              fs.unlinkSync(lyFile);
              pageFiles.forEach(file => {
                fs.unlinkSync(path.join(TMP_DIR, file));
              });
            } catch (err) {
              console.error(`[CLEANUP ERROR] ${err.message}`);
            }

            // Return array of pages
            resolve({ pages, multiPage: true });
          } else {
            // PDF format - single file
            const outputFile = `${outputBase}.pdf`;

            if (!fs.existsSync(outputFile)) {
              return reject({
                status: 500,
                message: 'Output file not found',
              });
            }

            // Read output
            const output = fs.readFileSync(outputFile);

            // Cache the result
            try {
              fs.writeFileSync(cacheKey, output);
              console.log(`[CACHED] ${cacheKey}`);
            } catch (err) {
              console.error(`[CACHE WRITE ERROR] ${err.message}`);
            }

            // Cleanup temp files
            try {
              fs.unlinkSync(lyFile);
              fs.unlinkSync(outputFile);
            } catch (err) {
              console.error(`[CLEANUP ERROR] ${err.message}`);
            }

            resolve({ pages: [output], multiPage: false });
          }
        } catch (err) {
          reject({
            status: 500,
            message: 'Post-processing error',
            error: err.message,
          });
        }
      });

      // Handle timeout
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
          reject({
            status: 408,
            message: 'Rendering timeout exceeded',
          });
        }
      }, RENDER_TIMEOUT + 1000);
    } catch (err) {
      console.error(`[SETUP ERROR] ${err.message}`);
      reject({
        status: 500,
        message: 'Server error',
        error: err.message,
      });
    }
  });
}

/**
 * POST /engrave
 *
 * Render LilyPond source to SVG or PDF
 *
 * Request body:
 * {
 *   "ly": "\\version \"2.24.0\"\\score { ... }",
 *   "format": "svg" | "pdf"  (default: "svg")
 * }
 *
 * Responses:
 * - 200: image/svg+xml or application/pdf
 * - 400: Invalid LilyPond source or compilation error
 * - 408: Request timeout
 * - 413: Payload too large
 * - 422: Missing or invalid parameters
 * - 500: Server error
 */
app.post('/engrave', async (req, res) => {
  try {
    const { ly, format = 'svg' } = req.body;

    // Validate parameters
    if (!ly || typeof ly !== 'string') {
      return res.status(422).json({
        error: 'Missing or invalid "ly" parameter',
      });
    }

    if (!['svg', 'pdf'].includes(format)) {
      return res.status(422).json({
        error: 'Invalid "format" parameter (must be "svg" or "pdf")',
      });
    }

    // Check size
    if (ly.length > MAX_REQUEST_SIZE) {
      return res.status(413).json({
        error: `LilyPond source exceeds maximum size (${MAX_REQUEST_SIZE} bytes)`,
      });
    }

    // Render
    const result = await renderLilyPond(ly, format);

    // For multi-page SVG, return JSON with base64-encoded pages
    if (result.multiPage && format === 'svg') {
      const pages = result.pages.map(page => page.toString('base64'));
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.json({
        format: 'svg',
        multiPage: true,
        pageCount: pages.length,
        pages: pages
      });
    } else {
      // Single file (PDF or backwards-compatible SVG)
      const output = result.pages[0];
      const contentType = format === 'pdf' ? 'application/pdf' : 'image/svg+xml';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(output);
    }
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);

    const status = err.status || 500;
    const response = {
      error: err.message,
    };

    if (err.errors) {
      response.details = err.errors;
    }
    if (err.stderr) {
      response.stderr = err.stderr;
    }

    res.status(status).json(response);
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

/**
 * Root info endpoint
 */
app.get('/', (req, res) => {
  res.json({
    service: 'LilyPond Rendering Service',
    version: '1.0.0',
    endpoints: {
      'POST /engrave': 'Render LilyPond to SVG/PDF',
      'GET /health': 'Health check',
      'GET /': 'This info',
    },
    limits: {
      max_request_size_bytes: MAX_REQUEST_SIZE,
      render_timeout_ms: RENDER_TIMEOUT,
    },
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
  });
});

/**
 * Error handler
 */
app.use((err, req, res, next) => {
  console.error(`[UNHANDLED ERROR] ${err.message}`);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[STARTUP] LilyPond Service listening on port ${PORT}`);
  console.log(`[CONFIG] MAX_REQUEST_SIZE=${MAX_REQUEST_SIZE} bytes`);
  console.log(`[CONFIG] RENDER_TIMEOUT=${RENDER_TIMEOUT}ms`);
  console.log(`[CONFIG] CACHE_DIR=${CACHE_DIR}`);
  console.log(`[CONFIG] TMP_DIR=${TMP_DIR}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] SIGINT received, shutting down...');
  process.exit(0);
});
