import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from '@rollup/plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/js/main.js',
  output: {
    file: 'dist/main.js',
    format: 'es',
    sourcemap: !production,
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
  external: ['../pkg/ecs_editor_wasm.js'],
};