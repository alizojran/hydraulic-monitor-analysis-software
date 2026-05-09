import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// GitHub Pages serves the site under /hydraulic-monitor-analysis-software/
// Override at build time via the BASE env var if you deploy elsewhere.
const base = process.env.BASE ?? '/hydraulic-monitor-analysis-software/'

export default defineConfig({
  base,
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
})
