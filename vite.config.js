import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
    open: true,
  },
  plugins: [
    {
      name: 'copy-static-assets',
      writeBundle() {
        copyDir('assets', 'dist/assets');
        copyFileSync('Gravity_Well.mp3', 'dist/Gravity_Well.mp3');
        copyFileSync('Gravity_Well_Escape.mp3', 'dist/Gravity_Well_Escape.mp3');
        copyFileSync('Hull_Breach_Protocol.mp3', 'dist/Hull_Breach_Protocol.mp3');
      }
    }
  ]
});
