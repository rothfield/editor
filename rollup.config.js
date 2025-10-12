import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/js/main.js',
  output: {
    file: 'dist/main.js',
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
    }),
    commonjs(),
    production && terser({
      format: {
        comments: false,
      },
    }),
  ],
  external: [/^\/dist\/pkg\//],
};