import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Relative paths so the built game runs from any folder or host.
  base: './',
  build: {
    // three.js alone is ~550 kB, so the default 500 kB warning would always fire.
    chunkSizeWarningLimit: 1000,
    // `--mode artifact` packs every texture into the script as data, so the whole game
    // fits in one HTML file (tools/build-artifact.mjs finishes the job).
    ...(mode === 'artifact' && { outDir: 'dist-artifact', assetsInlineLimit: () => true }),
  },
}));
