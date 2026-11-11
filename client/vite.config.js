import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync } from 'node:fs';

// The release this build is: the newest notes file in releases/notes (the
// releases page reads the same files). Empty if the folder isn't there.
function appVersion() {
  try {
    const versions = readdirSync(new URL('../releases/notes/', import.meta.url))
      .map((f) => /^(\d+)\.(\d+)\.(\d+)\.md$/.exec(f))
      .filter(Boolean)
      .map((m) => m.slice(1, 4).map(Number));
    versions.sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
    return versions[0] ? versions[0].join('.') : '';
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()),
  },
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
