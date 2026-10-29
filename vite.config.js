import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the built game runs from any folder or host.
  base: './',
  // three.js alone is ~550 kB, so the default 500 kB warning would always fire.
  build: { chunkSizeWarningLimit: 1000 },
});
