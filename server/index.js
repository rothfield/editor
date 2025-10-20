/**
 * Music Notation Editor API Proxy
 *
 * Acts as a bridge between the WebUI and the LilyPond rendering service.
 * Implements the /api/lilypond/render endpoint that the WebUI expects.
 */

const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const LILYPOND_SERVICE_URL = process.env.LILYPOND_SERVICE_URL || 'http://lilypond-service:8787';

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'music-notation-editor-api' });
});

// Health check for lilypond service
app.get('/api/lilypond/health', async (req, res) => {
  try {
    const response = await axios.get(`${LILYPOND_SERVICE_URL}/health`, {
      timeout: 5000
    });
    res.json({
      status: 'ok',
      lilypondService: response.data
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      error: error.message
    });
  }
});

/**
 * POST /api/lilypond/render
 *
 * Proxies LilyPond rendering requests to the lilypond-service
 *
 * Request body:
 * {
 *   "lilypond_source": "string",      // LilyPond source code
 *   "template_variant": "string",     // Template variant (optional)
 *   "output_format": "svg|pdf"        // Desired output format
 * }
 *
 * Response:
 * {
 *   "success": boolean,
 *   "svg_base64": "string",           // For SVG format
 *   "pdf_base64": "string",           // For PDF format
 *   "format": "svg|pdf",
 *   "error": "string"                 // If success is false
 * }
 */
app.post('/api/lilypond/render', async (req, res) => {
  const { lilypond_source, output_format = 'svg', template_variant } = req.body;

  // Validation
  if (!lilypond_source) {
    return res.status(400).json({
      success: false,
      error: 'Missing lilypond_source in request body'
    });
  }

  if (!['svg', 'pdf'].includes(output_format)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid output_format. Must be svg or pdf'
    });
  }

  try {
    // Forward request to lilypond-service using 'ly' parameter
    // lilypond-service returns binary data (arraybuffer)
    const response = await axios.post(
      `${LILYPOND_SERVICE_URL}/engrave`,
      {
        ly: lilypond_source,
        format: output_format
      },
      {
        timeout: 20000,
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // Convert binary response to base64
    const base64Data = Buffer.from(response.data).toString('base64');

    const fieldName = output_format === 'pdf' ? 'pdf_base64' : 'svg_base64';

    return res.json({
      success: true,
      [fieldName]: base64Data,
      format: output_format
    });

  } catch (error) {
    console.error('Lilypond rendering error:', error.message);

    // Handle timeout
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        error: 'Rendering request timed out'
      });
    }

    // Handle service unavailable
    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({
        success: false,
        error: 'LilyPond service unavailable'
      });
    }

    // Handle response errors from lilypond-service
    if (error.response) {
      try {
        // Try to parse error as JSON
        const errorData = JSON.parse(error.response.data.toString());
        return res.status(error.response.status || 500).json({
          success: false,
          error: errorData.error || error.message,
          details: errorData.details || errorData.stderr || null
        });
      } catch (e) {
        // If not JSON, return generic error
        return res.status(error.response.status || 500).json({
          success: false,
          error: 'LilyPond rendering failed',
          details: error.response.data?.toString() || null
        });
      }
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error during rendering'
    });
  }
});

/**
 * Serve static files from root (index.html, etc.)
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// 404 handler for other routes - serve index.html for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Music Notation Editor API listening on port ${PORT}`);
  console.log(`LilyPond Service: ${LILYPOND_SERVICE_URL}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});
