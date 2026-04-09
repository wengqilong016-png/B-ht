import { readFileSync } from 'fs';
import path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      // Target Safari 13+ (iOS 13+) to ensure broad iOS compatibility
      target: ['es2015', 'safari13'],
      rollupOptions: {
        output: {
          // Split heavy third-party libraries into separate cached chunks.
          // Each group is independently cacheable by the browser.
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            // React core (including scheduler which react-dom depends on)
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-is/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }

            // Supabase client
            if (id.includes('@supabase/')) {
              return 'vendor-supabase';
            }

            // OpenAI SDK
            if (id.includes('openai')) {
              return 'vendor-ai';
            }

            // Leaflet + react-leaflet map libraries
            if (id.includes('/leaflet') || id.includes('react-leaflet')) {
              return 'vendor-maps';
            }

            // Recharts + its D3 peer-dependencies
            if (
              id.includes('/recharts') ||
              id.includes('/d3-') ||
              id.includes('/d3/') ||
              id.includes('victory-vendor')
            ) {
              return 'vendor-charts';
            }

            // Lucide icon set (tree-shaken but still sizable)
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }

            // Everything else (exif-js, @vercel/analytics, etc.)
            return 'vendor-misc';
          },
        },
      },
    }
});
