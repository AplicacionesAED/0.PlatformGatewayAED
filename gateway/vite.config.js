import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5190,
    // En produccion el gateway publica el servicio de login como /portal/api/* (nginx quita el prefijo /portal);
    // en desarrollo Vite hace lo mismo hacia el servicio local (auth/, puerto 3060).
    proxy: {
      '/portal/api': { target: 'http://localhost:3060', rewrite: (path) => path.replace(/^\/portal/, '') },
    },
  },
});
