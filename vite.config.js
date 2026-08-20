import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' so the build can live anywhere inside your portfolio (e.g. /02/)
export default defineConfig({
  plugins: [react()],
  base: './',
});
