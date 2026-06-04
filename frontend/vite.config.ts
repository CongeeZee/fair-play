import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split only the truly app-wide, rarely-changing vendor libraries into
        // their own cacheable chunks. recharts is deliberately NOT grouped here:
        // it's only used by the lazy Stats/Profile routes, so the route-level
        // code splitting already isolates it into an async chunk. Forcing it
        // into a manual chunk pulls a shared symbol — and the whole 360 kB
        // library — into the entry's critical path.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('react-router')) return 'react-vendor'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'react-vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
