import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Version de l'app = dernier commit (même valeur pour le site web et l'app Android,
// même s'ils sont construits séparément). L'app installée compare avec version.json du site.
function gitVersion(): { sha: string; time: number } {
  try {
    const [sha, time] = execSync('git log -1 --format=%h%n%ct').toString().trim().split('\n');
    return { sha, time: Number(time) };
  } catch {
    return { sha: 'dev', time: 0 };
  }
}
const VERSION = gitVersion();

// base './' pour que l'app fonctionne aussi sur GitHub Pages ou dans un sous-dossier
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [
    react(),
    {
      name: 'version-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(VERSION) });
      },
    },
  ],
  build: { chunkSizeWarningLimit: 2000 },
});
