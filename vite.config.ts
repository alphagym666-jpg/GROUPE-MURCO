import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' pour que l'app fonctionne aussi sur GitHub Pages ou dans un sous-dossier
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
});
