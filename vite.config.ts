import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The production build is one self-contained dist/index.html (scripts and
// styles inlined), so it opens straight from disk and deploys to any static host.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020', outDir: 'dist', emptyOutDir: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
