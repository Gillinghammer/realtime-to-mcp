import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2022',
  platform: 'node',
  external: ['ws'],
  esbuildOptions(options) {
    options.banner = {
      js: '"use strict";',
    };
  },
}); 