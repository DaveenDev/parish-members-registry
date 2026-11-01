import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // The libraries change far less often than the app: in files of their
        // own, a phone that has visited keeps them cached across deploys and
        // downloads only the app's part again.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|@remix-run|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase';
          return undefined;
        },
      },
    },
  },
});
