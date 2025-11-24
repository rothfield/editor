import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/js/main.js',
  output: {
    dir: 'dist',
    entryFileNames: 'main.js',
    chunkFileNames: '[name].js',
    format: 'es',
    sourcemap: !production,
    paths: {
      '/dist/pkg/editor_wasm.js': '/dist/pkg/editor_wasm.js'
    }
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false,
      extensions: ['.ts', '.js']
    }),
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: !production,
      inlineSources: !production,
      declaration: false,
      declarationMap: false,
      compilerOptions: {
        outDir: 'dist',
        rootDir: 'src'
      }
    }),
    commonjs(),
    production && terser({
      format: {
        comments: false,
      },
    }),
  ],
  external: [/^\/dist\/pkg\//],
  onwarn(warning, warn) {
    // Suppress "this has been rewritten to undefined" warnings from dependencies
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    // Use default for everything else
    warn(warning);
  }
};