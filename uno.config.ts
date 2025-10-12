import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss';

export default defineConfig({
  // Scan files for class usage
  content: {
    filesystem: [
      'src/**/*.{js,ts,html}',
      'index.html',
    ],
  },

  // Presets for modern CSS
  presets: [
    presetUno(), // Default preset (Tailwind-like)
    presetAttributify(), // Attributify mode
    presetIcons({ // Icon support
      scale: 1.2,
      warn: true,
    }),
  ],

  // Custom theme configuration
  theme: {
    colors: {
      // Musical notation colors
      'notation': {
        'text': '#1a1a1a',
        'background': '#ffffff',
        'selection': '#007acc',
        'focus': '#0066cc',
        'accent': '#ff6b35',
        'temporal': '#0066cc',
        'non-temporal': '#666666',
        'beat-loop': '#ff9500',
        'slur': '#333333',
        'octave': '#cc0000',
        'text-token': '#cc0000',
        'barline': '#000000',
        'breath': '#666666',
      },

      // UI colors
      'ui': {
        'border': '#e5e7eb',
        'background': '#f9fafb',
        'hover': '#f3f4f6',
        'active': '#e5e7eb',
        'disabled': '#f9fafb',
        'disabled-text': '#9ca3af',
      },

      // Semantic colors
      'success': '#10b981',
      'warning': '#f59e0b',
      'error': '#ef4444',
      'info': '#3b82f6',
    },

    // Typography
    fontFamily: {
      'sans': ['Inter', 'system-ui', 'sans-serif'],
      'mono': ['JetBrains Mono', 'Consolas', 'Monaco', 'monospace'],
      'notation': ['Bravura', 'Leland', 'Leipzig', 'sans-serif'],
    },

    // Font sizes for musical notation
    fontSize: {
      'notation-xs': ['0.75rem', { 'line-height': '1' }],
      'notation-sm': ['0.875rem', { 'line-height': '1' }],
      'notation': ['1rem', { 'line-height': '1' }],
      'notation-lg': ['1.125rem', { 'line-height': '1' }],
      'notation-xl': ['1.25rem', { 'line-height': '1' }],
      'notation-2xl': ['1.5rem', { 'line-height': '1' }],
      'notation-3xl': ['1.875rem', { 'line-height': '1' }],
      'notation-4xl': ['2.25rem', { 'line-height': '1' }],
    },

    // Spacing for musical notation
    spacing: {
      '18': '4.5rem',
      '88': '22rem',
      '128': '32rem',
      'beat-gap': '0.25rem',
      'lane-gap': '0.5rem',
      'octave-gap': '0.75rem',
      'slur-curve': '0.15rem',
    },

    // Z-index layers
    zIndex: {
      'notation': 1,
      'beat-loop': 2,
      'slur': 3,
      'octave': 4,
      'cursor': 5,
      'selection': 6,
      'menu': 10,
      'modal': 20,
      'toast': 30,
    },

    // Animation durations
    duration: {
      'beat-loop': '1s',
      'cursor-blink': '1s',
      'focus-transition': '0.15s',
      'hover-transition': '0.2s',
      'slide-in': '0.3s',
    },

    // Border radius for musical elements
    borderRadius: {
      'notation': '0.125rem',
      'octave': '50%',
    },

    // Box shadows for musical effects
    boxShadow: {
      'notation': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      'slur': '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      'beat-loop': 'inset 0 -1px 1px rgba(0, 0, 0, 0.1)',
    },
  },

  // Custom rules for musical notation
  rules: [
    // CharCell base styling
    [/^char-cell$/, () => ({
      'position': 'relative',
      'display': 'inline-block',
      'font-family': 'theme("fontFamily.notation")',
      'font-size': 'theme("fontSize.notation")',
      'line-height': '1',
      'vertical-align': 'baseline',
      'cursor': 'text',
      'user-select': 'text',
    })],

    // Lane positioning
    [/^lane-(upper|letter|lower|lyrics)$/, ([, lane]) => {
      const positions = {
        upper: { transform: 'translateY(-0.8em)' },
        letter: { transform: 'translateY(0)' },
        lower: { transform: 'translateY(0.4em)' },
        lyrics: { transform: 'translateY(1.2em)' },
      };
      return positions[lane] || {};
    }],

    // Element type styling
    [/^kind-(pitched|unpitched|upper-annotation|lower-annotation|text|barline|breath|whitespace)$/, ([, kind]) => {
      const styles = {
        pitched: { color: 'theme("colors.notation.temporal")' },
        unpitched: { color: 'theme("colors.notation.non-temporal")' },
        'upper-annotation': { color: 'theme("colors.notation.octave")' },
        'lower-annotation': { color: 'theme("colors.notation.octave")' },
        text: { color: 'theme("colors.notation.text-token")' },
        barline: {
          color: 'theme("colors.notation.barline")',
          'font-weight': 'bold',
        },
        breath: {
          color: 'theme("colors.notation.breath")',
          'font-style': 'italic',
        },
        whitespace: { color: 'transparent' },
      };
      return styles[kind] || {};
    }],

    // Pitch system styling
    [/^pitch-system-(number|western|sargam|bhatkhande|tabla)$/, ([, system]) => {
      const weights = {
        number: 'font-normal',
        western: 'font-normal',
        sargam: 'font-medium',
        bhatkhande: 'font-medium',
        tabla: 'font-bold',
      };
      return { [weights[system]]: true };
    }],

    // Beat loop styling
    [/^beat-loop$/, () => ({
      'position': 'absolute',
      'bottom': '1.25rem',
      'height': '0.375rem',
      'background': 'theme("colors.notation.beat-loop")',
      'border-radius': 'theme("borderRadius.notation")',
      'box-shadow': 'theme("boxShadow.beat-loop")',
      'pointer-events': 'none',
      'z-index': 'theme("zIndex.beat-loop")',
    })],

    // Octave dot styling
    [/^octave-(above|below)$/, ([, position]) => ({
      'position': 'absolute',
      'width': '0.25rem',
      'height': '0.25rem',
      'background': 'theme("colors.notation.octave")',
      'border-radius': 'theme("borderRadius.octave")',
      'z-index': 'theme("zIndex.octave")',
      ...(position === 'above'
        ? { top: '-0.5rem' }
        : { bottom: '-0.3rem' }
      ),
    })],

    // Selection styling
    [/^selected$/, () => ({
      'background': 'theme("colors.notation.selection")',
      'color': 'white',
    })],

    // Focus styling
    [/^focused$/, () => ({
      'outline': '2px solid theme("colors.notation.focus")',
      'outline-offset': '1px',
    })],

    // Cursor styling
    [/^cursor$/, () => ({
      'position': 'absolute',
      'width': '2px',
      'height': '1.2em',
      'background': 'theme("colors.notation.focus")',
      'animation': 'cursor-blink 1s infinite',
      'z-index': 'theme("zIndex.cursor")',
      'pointer-events': 'none',
    })],

    // Animation keyframes
    [/^@keyframes cursor-blink$/, () => ({
      '0%, 49%': { opacity: '1' },
      '50%, 100%': { opacity: '0' },
    })],

    // UI component styling
    [/^menu-item$/, () => ({
      'padding': '0.5rem 1rem',
      'cursor': 'pointer',
      'transition': 'all theme("duration.hover-transition")',
      '&:hover': {
        'background': 'theme("colors.ui.hover")',
      },
      '&:active': {
        'background': 'theme("colors.ui.active")',
      },
    })],

    // Tab styling
    [/^tab$/, () => ({
      'padding': '0.5rem 1rem',
      'cursor': 'pointer',
      'border-bottom': '2px solid transparent',
      'transition': 'all theme("duration.focus-transition")',
      '&.active': {
        'border-bottom-color': 'theme("colors.notation.focus")',
        'color': 'theme("colors.notation.focus")',
      },
    })],

    // Error styling
    [/^error$/, () => ({
      'color': 'theme("colors.error")',
      'background': 'rgba(239, 68, 68, 0.1)',
      'border': '1px solid theme("colors.error")',
      'border-radius': '0.25rem',
      'padding': '0.25rem 0.5rem',
    })],

    // Success styling
    [/^success$/, () => ({
      'color': 'theme("colors.success")',
      'background': 'rgba(16, 185, 129, 0.1)',
      'border': '1px solid theme("colors.success")',
      'border-radius': '0.25rem',
      'padding': '0.25rem 0.5rem',
    })],
  ],

  // Shortcuts for common combinations
  shortcuts: {
    // Layout shortcuts
    'notation-canvas': 'relative w-full h-full font-notation text-notation bg-notation-background overflow-hidden',
    'notation-line': 'relative h-8 w-full',

    // Interactive elements
    'interactive': 'cursor-pointer transition-all duration-hover-transition hover:bg-ui-hover active:bg-ui-active',

    // Focus management
    'focusable': 'focus:outline-none focus:ring-2 focus:ring-notation-focus focus:ring-offset-1',

    // Text styles
    'notation-text': 'font-notation text-notation text-notation-text leading-none',
    'temporal-text': 'text-notation-temporal',
    'non-temporal-text': 'text-notation-non-temporal',
    'token-text': 'text-notation-text-token',
  },

  // Performance optimizations
  presets: [
    presetUno({
      // Enable important utilities for CSS specificity battles
      important: true,
    }),
  ],

  // Build optimization
  build: {
    // Minify CSS in production
    minify: true,

    // Enable CSS source maps in development
    sourcemap: process.env.NODE_ENV === 'development',
  },
});