import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    // Base path — change to your repo name for GitHub Pages
    // Example: '/visor-3d/' for https://username.github.io/visor-3d/
    // Use '/' for Vercel/Netlify or custom domains
    base: '/',

    build: {
        outDir: 'dist',
        sourcemap: false,
        // Multi-page app: Viewer + Converter
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                converter: resolve(__dirname, 'converter.html'),
            },
            output: {
                manualChunks: {
                    three: ['three'],
                    thatopen: ['@thatopen/components', '@thatopen/fragments'],
                },
            },
        },
    },

    optimizeDeps: {
        // Exclude web-ifc from optimization as it uses WASM
        exclude: ['web-ifc'],
    },

    server: {
        port: 5173,
        open: true,
        // Allow CORS for iframe embedding during development
        cors: true,
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
    },

    preview: {
        port: 4173,
        cors: true,
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
    },
});
